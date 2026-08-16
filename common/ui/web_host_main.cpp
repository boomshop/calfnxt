/**
 * calfnxt-web-host — out-of-process GtkPlug + WebKitGTK editor.
 *
 * Spawned by the VST3 module (no GTK in the host process). Speaks newline-
 * delimited messages on an inherited Unix socket FD:
 *   plugin → host: JS one-liners to evaluate, or {"t":"_size","w","h"}
 *   host → plugin: UI JSON from calfnxtNative.post, {"t":"_ready"}, or
 *                  {"t":"_socket","w","h"} (XEmbed parent size)
 */

#include <gdk/gdkx.h>
#include <glib-unix.h>
#include <gtk/gtk.h>
#include <gtk/gtkx.h>
#include <jsc/jsc.h>
#include <webkit2/webkit2.h>

#include <cerrno>
#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fcntl.h>
#include <string>
#include <unistd.h>

namespace {

struct HostState
{
  int sock = -1;
  std::string readBuf;
  char webRoot[4096] {};
  char entryHtml[256] {};
  int width = 360;
  int height = 420;
  unsigned long parentXid = 0;
  GtkWidget* plug = nullptr;
  WebKitWebView* webview = nullptr;
  WebKitWebContext* ctx = nullptr;
  guint sockSource = 0;
  /** Guard: gtk_widget_size_allocate must not re-enter sync/force paths. */
  bool inSizeAllocate = false;
  /** Idle coalescing when the embedder keeps handing us 1×1. */
  guint forceAllocIdle = 0;
  int forceAllocTries = 0;
  /** Poll until XEmbed plug/webview are X11-Viewable, then stop. */
  guint mapPollSource = 0;
  int mapPollTries = 0;
  bool mapOk = false;
  /** Held so WebKit keeps presenting without a host Configure (XWayland). */
  GdkFrameClock* frameClock = nullptr;
};

HostState g;

/** Map-poll interval: ~one frame, cheap, snappy for XEmbed hosts that never map. */
constexpr int kMapPollMs = 16;
/** Give up after ~2s so a stuck embedder cannot spin forever. */
constexpr int kMapPollMaxTries = 2000 / kMapPollMs;

bool envFlag(const char* name)
{
  const char* s = std::getenv(name);
  return s != nullptr && s[0] != '\0';
}

void hostLog(const char* fmt, ...)
{
  char buf[1024];
  va_list ap;
  va_start(ap, fmt);
  const int n = std::vsnprintf(buf, sizeof buf, fmt, ap);
  va_end(ap);
  if (n <= 0)
    return;
  std::fputs(buf, stderr);
  std::fflush(stderr);
  const int fd = ::open("/tmp/calfnxt-ui.log", O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0644);
  if (fd >= 0)
  {
    (void)::write(fd, buf, static_cast<size_t>(std::strlen(buf)));
    ::close(fd);
  }
}

bool sendLine(const char* line)
{
  if (g.sock < 0 || !line)
    return false;
  std::string msg(line);
  if (msg.empty() || msg.back() != '\n')
    msg.push_back('\n');
  const char* p = msg.data();
  size_t left = msg.size();
  while (left > 0)
  {
    const ssize_t w = ::write(g.sock, p, left);
    if (w < 0)
    {
      if (errno == EINTR)
        continue;
      return false;
    }
    p += static_cast<size_t>(w);
    left -= static_cast<size_t>(w);
  }
  return true;
}

void plugGdkSize(int& outW, int& outH)
{
  outW = -1;
  outH = -1;
  if (!g.plug)
    return;
  if (GdkWindow* win = gtk_widget_get_window(g.plug))
    gdk_window_get_geometry(win, nullptr, nullptr, &outW, &outH);
}

/** Report XEmbed socket size to the plugin (for HiDPI enlarge vs fill decision). */
void reportSocketSize(const char* why)
{
  if (!g.parentXid || g.sock < 0)
    return;
  Display* dpy = nullptr;
  if (g.plug)
  {
    if (GdkWindow* win = gtk_widget_get_window(g.plug))
      dpy = GDK_WINDOW_XDISPLAY(win);
  }
  if (!dpy)
  {
    if (GdkDisplay* gd = gdk_display_get_default())
      dpy = GDK_DISPLAY_XDISPLAY(gd);
  }
  if (!dpy)
    return;
  Window root = 0;
  int x = 0;
  int y = 0;
  unsigned w = 0;
  unsigned h = 0;
  unsigned border = 0;
  unsigned depth = 0;
  if (!XGetGeometry(dpy, static_cast<Window>(g.parentXid), &root, &x, &y, &w, &h, &border,
                    &depth))
    return;
  if (w < 2 || h < 2)
    return;
  hostLog("[calfnxt-web-host] socket %s %ux%u (want %dx%d)\n", why ? why : "?", w, h, g.width,
          g.height);
  char line[96];
  std::snprintf(line, sizeof line, "{\"t\":\"_socket\",\"w\":%u,\"h\":%u}\n", w, h);
  sendLine(line);
}

void logAlloc(const char* why)
{
  const int pw = g.plug ? gtk_widget_get_allocated_width(g.plug) : -1;
  const int ph = g.plug ? gtk_widget_get_allocated_height(g.plug) : -1;
  const int vw = g.webview ? gtk_widget_get_allocated_width(GTK_WIDGET(g.webview)) : -1;
  const int vh = g.webview ? gtk_widget_get_allocated_height(GTK_WIDGET(g.webview)) : -1;
  const int emb = (g.plug && gtk_plug_get_embedded(GTK_PLUG(g.plug))) ? 1 : 0;
  int gdkW = -1;
  int gdkH = -1;
  plugGdkSize(gdkW, gdkH);
  hostLog("[calfnxt-web-host] alloc %s plug=%dx%d webview=%dx%d gdk=%dx%d embedded=%d want=%dx%d\n",
          why, pw, ph, vw, vh, gdkW, gdkH, emb, g.width, g.height);
}

/** X11 attributes for realized widgets — present/compositing diagnosis. */
void logX11Window(const char* label, GtkWidget* widget)
{
  if (!widget)
  {
    hostLog("[calfnxt-web-host] x11 %s: (null widget)\n", label);
    return;
  }
  GdkWindow* gdkWin = gtk_widget_get_window(widget);
  if (!gdkWin)
  {
    hostLog("[calfnxt-web-host] x11 %s: unrealized\n", label);
    return;
  }

  const Window xid = gdk_x11_window_get_xid(gdkWin);
  Display* dpy = GDK_WINDOW_XDISPLAY(gdkWin);
  XWindowAttributes wa {};
  if (!dpy || !XGetWindowAttributes(dpy, xid, &wa))
  {
    hostLog("[calfnxt-web-host] x11 %s: xid=0x%lx attrs-fail\n", label,
            static_cast<unsigned long>(xid));
    return;
  }

  const char* mapState = "Unmapped";
  if (wa.map_state == IsUnviewable)
    mapState = "Unviewable";
  else if (wa.map_state == IsViewable)
    mapState = "Viewable";

  const int depth = wa.depth;
  const int cls = wa.c_class; // InputOutput=1, InputOnly=2
  const char* clsName = cls == InputOutput ? "InputOutput" : (cls == InputOnly ? "InputOnly" : "?");

  int visualType = -1;
  int bitsRgb = -1;
  if (wa.visual)
  {
    visualType = wa.visual->c_class; // StaticGray…TrueColor…
    bitsRgb = wa.visual->bits_per_rgb;
  }

  GdkScreen* screen = gtk_widget_get_screen(widget);
  const int hasRgba = (screen && gdk_screen_get_rgba_visual(screen)) ? 1 : 0;
  GdkVisual* widgetVisual = gdk_window_get_visual(gdkWin);
  GdkVisual* systemVisual = screen ? gdk_screen_get_system_visual(screen) : nullptr;
  const int isSystemVisual =
    (widgetVisual && systemVisual && widgetVisual == systemVisual) ? 1 : 0;
  const int isRgbaVisual =
    (screen && widgetVisual && widgetVisual == gdk_screen_get_rgba_visual(screen)) ? 1 : 0;

  hostLog("[calfnxt-web-host] x11 %s xid=0x%lx %dx%d+%d+%d depth=%d class=%s map=%s "
          "visual_class=%d bits_rgb=%d system_visual=%d rgba_visual=%d screen_has_rgba=%d "
          "viewable_hint=%d\n",
          label, static_cast<unsigned long>(xid), wa.width, wa.height, wa.x, wa.y, depth, clsName,
          mapState, visualType, bitsRgb, isSystemVisual, isRgbaVisual, hasRgba,
          gtk_widget_get_mapped(widget) ? 1 : 0);

  // Immediate children (WebKit often uses an extra child X window for content).
  Window root = 0;
  Window parent = 0;
  Window* children = nullptr;
  unsigned nchildren = 0;
  if (XQueryTree(dpy, xid, &root, &parent, &children, &nchildren))
  {
    hostLog("[calfnxt-web-host] x11 %s parent=0x%lx children=%u\n", label,
            static_cast<unsigned long>(parent), nchildren);
    for (unsigned i = 0; i < nchildren && i < 8; ++i)
    {
      XWindowAttributes cwa {};
      if (!XGetWindowAttributes(dpy, children[i], &cwa))
        continue;
      const char* cmap = "Unmapped";
      if (cwa.map_state == IsUnviewable)
        cmap = "Unviewable";
      else if (cwa.map_state == IsViewable)
        cmap = "Viewable";
      hostLog("[calfnxt-web-host] x11 %s child[%u]=0x%lx %dx%d depth=%d map=%s\n", label, i,
              static_cast<unsigned long>(children[i]), cwa.width, cwa.height, cwa.depth, cmap);
    }
    if (children)
      XFree(children);
  }
}

void logX11Surface(const char* why)
{
  if (!envFlag("CALFNXT_WEB_DEBUG"))
    return;
  hostLog("[calfnxt-web-host] x11-surface %s\n", why);
  logX11Window("plug", g.plug);
  logX11Window("webview", g.webview ? GTK_WIDGET(g.webview) : nullptr);
}

/** X11 map_state of a realized widget; -1 if unknown. */
int x11MapState(GtkWidget* widget)
{
  if (!widget)
    return -1;
  GdkWindow* gdkWin = gtk_widget_get_window(widget);
  if (!gdkWin)
    return -1;
  Display* dpy = GDK_WINDOW_XDISPLAY(gdkWin);
  const Window xid = gdk_x11_window_get_xid(gdkWin);
  XWindowAttributes wa {};
  if (!dpy || !XGetWindowAttributes(dpy, xid, &wa))
    return -1;
  return static_cast<int>(wa.map_state);
}

bool x11IsViewable(GtkWidget* widget)
{
  return x11MapState(widget) == IsViewable;
}

bool surfaceX11Viewable()
{
  return g.plug && x11IsViewable(g.plug) && (!g.webview || x11IsViewable(GTK_WIDGET(g.webview)));
}

void mapX11Windows()
{
  auto mapOne = [](GtkWidget* widget) {
    if (!widget)
      return;
    gtk_widget_show(widget);
    GdkWindow* win = gtk_widget_get_window(widget);
    if (!win)
      return;
    gdk_window_show(win);
    Display* dpy = GDK_WINDOW_XDISPLAY(win);
    const Window xid = gdk_x11_window_get_xid(win);
    if (dpy && xid)
    {
      XMapWindow(dpy, xid);
      XFlush(dpy);
    }
  };

  mapOne(g.plug);
  mapOne(g.webview ? GTK_WIDGET(g.webview) : nullptr);
}

void disableFrameSync(GtkWidget* widget)
{
  if (!widget)
    return;
  GdkWindow* win = gtk_widget_get_window(widget);
  if (!win)
    return;
  // GtkPlug already does this on its own GdkWindow. WebKit's child window
  // still waits for _NET_WM_SYNC that Ardour/XWayland never acks → one
  // present per user resize.
  gdk_x11_window_set_frame_sync_enabled(win, FALSE);
}

void releaseFrameClock()
{
  if (!g.frameClock)
    return;
  gdk_frame_clock_end_updating(g.frameClock);
  g_object_unref(g.frameClock);
  g.frameClock = nullptr;
}

void holdFrameClock()
{
  GtkWidget* w = g.webview ? GTK_WIDGET(g.webview) : g.plug;
  if (!w)
    return;
  GdkFrameClock* clock = gtk_widget_get_frame_clock(w);
  if (!clock && g.plug)
    clock = gtk_widget_get_frame_clock(g.plug);
  if (!clock || g.frameClock == clock)
    return;
  releaseFrameClock();
  gdk_frame_clock_begin_updating(clock);
  g.frameClock = GDK_FRAME_CLOCK(g_object_ref(clock));
  hostLog("[calfnxt-web-host] frame-clock held\n");
}

void enablePresent(const char* why)
{
  disableFrameSync(g.plug);
  if (g.webview)
    disableFrameSync(GTK_WIDGET(g.webview));
  holdFrameClock();
  if (why)
    hostLog("[calfnxt-web-host] present %s\n", why);
}

/**
 * Evidence (tester vs working host): after XEmbed, both start Unmapped;
 * working host becomes Viewable within ~500ms, tester stays Unmapped forever
 * → transparent socket hole despite healthy DOM.
 *
 * Poll every kMapPollMs, map if needed, stop once Viewable (or after timeout).
 */
gboolean onMapPoll(gpointer)
{
  ++g.mapPollTries;

  if (surfaceX11Viewable())
  {
    hostLog("[calfnxt-web-host] map-ok after %d poll(s) (~%d ms)\n", g.mapPollTries,
            g.mapPollTries * kMapPollMs);
    g.mapOk = true;
    g.mapPollSource = 0;
    enablePresent("map-ok");
    reportSocketSize("map-ok");
    return G_SOURCE_REMOVE;
  }

  if (g.mapPollTries == 1)
    hostLog("[calfnxt-web-host] map-poll: not Viewable yet — show/map (every %dms)\n", kMapPollMs);

  mapX11Windows();

  if (surfaceX11Viewable())
  {
    hostLog("[calfnxt-web-host] map-ok via ensure after %d poll(s) (~%d ms)\n", g.mapPollTries,
            g.mapPollTries * kMapPollMs);
    g.mapOk = true;
    g.mapPollSource = 0;
    enablePresent("map-ok");
    reportSocketSize("map-ok");
    return G_SOURCE_REMOVE;
  }

  if (g.mapPollTries >= kMapPollMaxTries)
  {
    hostLog("[calfnxt-web-host] map-give-up after %d polls (~%d ms) plug=%d webview=%d\n",
            g.mapPollTries, g.mapPollTries * kMapPollMs, x11MapState(g.plug),
            g.webview ? x11MapState(GTK_WIDGET(g.webview)) : -1);
    g.mapPollSource = 0;
    return G_SOURCE_REMOVE;
  }

  return G_SOURCE_CONTINUE;
}

void startMapPoll()
{
  if (g.mapPollSource || g.mapOk)
    return;
  if (surfaceX11Viewable())
  {
    g.mapOk = true;
    enablePresent("map-already");
    return;
  }
  g.mapPollTries = 0;
  g.mapPollSource = g_timeout_add(kMapPollMs, onMapPoll, nullptr);
}

/** True when GTK allocation is unusable for WebKit layout (< 2×2). */
bool gtkAllocTiny()
{
  if (!g.plug)
    return true;
  const int pw = gtk_widget_get_allocated_width(g.plug);
  const int ph = gtk_widget_get_allocated_height(g.plug);
  if (pw < 2 || ph < 2)
    return true;
  if (!g.webview)
    return false;
  const int vw = gtk_widget_get_allocated_width(GTK_WIDGET(g.webview));
  const int vh = gtk_widget_get_allocated_height(GTK_WIDGET(g.webview));
  return vw < 2 || vh < 2;
}

/**
 * XEmbed/GtkPlug on some native-X11 hosts (e.g. Carla+XFCE): Gdk/X window is
 * already design-sized, but GTK keeps allocating the plug/webview at 1×1 so
 * WebKit lays out at zero CSS size → transparent "background hole".
 *
 * Fix: force gtk_widget_size_allocate to the Gdk size (else design want).
 * Do NOT XResize the foreign embedder/parent — that caused BadAccess earlier.
 */
bool forceGtkAllocation(const char* why)
{
  if (!g.plug || g.inSizeAllocate)
    return false;
  if (!gtkAllocTiny())
    return false;

  int gdkW = -1;
  int gdkH = -1;
  plugGdkSize(gdkW, gdkH);

  int w = g.width;
  int h = g.height;
  if (gdkW >= 2 && gdkH >= 2)
  {
    w = gdkW;
    h = gdkH;
  }
  if (w < 2 || h < 2)
    return false;

  const int pw = gtk_widget_get_allocated_width(g.plug);
  const int ph = gtk_widget_get_allocated_height(g.plug);
  const int vw = g.webview ? gtk_widget_get_allocated_width(GTK_WIDGET(g.webview)) : -1;
  const int vh = g.webview ? gtk_widget_get_allocated_height(GTK_WIDGET(g.webview)) : -1;

  g.inSizeAllocate = true;
  hostLog("[calfnxt-web-host] force-alloc %s plug=%dx%d webview=%dx%d → %dx%d (gdk=%dx%d want=%dx%d)\n",
          why, pw, ph, vw, vh, w, h, gdkW, gdkH, g.width, g.height);

  GtkAllocation a {};
  a.x = 0;
  a.y = 0;
  a.width = w;
  a.height = h;
  gtk_widget_size_allocate(g.plug, &a);
  if (g.webview)
  {
    GtkAllocation child = a;
    gtk_widget_size_allocate(GTK_WIDGET(g.webview), &child);
  }
  g.inSizeAllocate = false;

  if (g.plug)
    gtk_widget_queue_draw(g.plug);
  if (g.webview)
    gtk_widget_queue_draw(GTK_WIDGET(g.webview));

  logAlloc(why);
  return !gtkAllocTiny();
}

gboolean onForceAllocIdle(gpointer)
{
  g.forceAllocIdle = 0;
  if (!g.plug)
    return G_SOURCE_REMOVE;
  if (!gtkAllocTiny())
    return G_SOURCE_REMOVE;
  ++g.forceAllocTries;
  char why[32];
  std::snprintf(why, sizeof why, "idle-%d", g.forceAllocTries);
  forceGtkAllocation(why);
  // Embedder may overwrite with 1×1 again — retry briefly, then stop.
  if (gtkAllocTiny() && g.forceAllocTries < 30)
  {
    g.forceAllocIdle = g_timeout_add(100, onForceAllocIdle, nullptr);
  }
  return G_SOURCE_REMOVE;
}

void scheduleForceAlloc()
{
  if (g.forceAllocIdle || !g.plug || g.inSizeAllocate)
    return;
  if (!gtkAllocTiny())
    return;
  g.forceAllocIdle = g_idle_add(onForceAllocIdle, nullptr);
}

void syncNativeSize()
{
  if (!g.plug || g.inSizeAllocate)
    return;
  const int w = g.width;
  const int h = g.height;
  if (w < 1 || h < 1)
    return;
  gtk_widget_set_size_request(g.plug, w, h);
  if (g.webview)
  {
    webkit_web_view_set_zoom_level(g.webview, 1.0);
    gtk_widget_set_hexpand(GTK_WIDGET(g.webview), TRUE);
    gtk_widget_set_vexpand(GTK_WIDGET(g.webview), TRUE);
    gtk_widget_set_size_request(GTK_WIDGET(g.webview), w, h);
  }
  if (GdkWindow* win = gtk_widget_get_window(g.plug))
    gdk_window_resize(win, w, h);
  gtk_widget_queue_resize(g.plug);
  // If queue_resize left us at 1×1 while Gdk is already large, force now.
  if (gtkAllocTiny())
    forceGtkAllocation("sync");
}

void evalJs(const char* js)
{
  if (!g.webview || !js)
    return;
  webkit_web_view_evaluate_javascript(
    g.webview, js, -1, nullptr, nullptr, nullptr,
    +[](GObject* object, GAsyncResult* result, gpointer) {
      GError* error = nullptr;
      JSCValue* value =
        webkit_web_view_evaluate_javascript_finish(WEBKIT_WEB_VIEW(object), result, &error);
      if (error)
      {
        hostLog("[calfnxt-web-host] evalJs: %s\n", error->message);
        g_error_free(error);
      }
      if (value)
        g_object_unref(value);
    },
    nullptr);
}

/** Probe DOM/CSS sizes after load — distinguishes layout-0 vs paint/compositing hole. */
void probeJsSize(const char* why)
{
  if (!g.webview || !why)
    return;
  char js[900];
  std::snprintf(
    js, sizeof js,
    "(function(){"
    "var r=document.getElementById('root');"
    "var iw=(window.innerWidth)|0, ih=(window.innerHeight)|0;"
    "var cw=document.documentElement?document.documentElement.clientWidth|0:0;"
    "var ch=document.documentElement?document.documentElement.clientHeight|0:0;"
    "var rw=r?r.clientWidth|0:-1, rh=r?r.clientHeight|0:-1, kids=r?r.children.length:-1;"
    "var msg='%s|iw='+iw+'|ih='+ih+'|cw='+cw+'|ch='+ch+'|rw='+rw+'|rh='+rh+'|kids='+kids;"
    "if(window.calfnxtNative&&window.calfnxtNative.post)"
    "window.calfnxtNative.post({t:'_diag',msg:msg,w:iw,h:ih});"
    "})();",
    why);
  evalJs(js);
}

void scheduleJsProbes()
{
  g_timeout_add(100, +[](gpointer) -> gboolean {
    probeJsSize("t+100ms");
    return G_SOURCE_REMOVE;
  }, nullptr);
  g_timeout_add(500, +[](gpointer) -> gboolean {
    probeJsSize("t+500ms");
    return G_SOURCE_REMOVE;
  }, nullptr);
  g_timeout_add(1500, +[](gpointer) -> gboolean {
    probeJsSize("t+1.5s");
    return G_SOURCE_REMOVE;
  }, nullptr);
}

bool jsonHasType(const char* s, const char* type)
{
  char needle[40];
  std::snprintf(needle, sizeof needle, "\"t\":\"%s\"", type);
  if (std::strstr(s, needle))
    return true;
  std::snprintf(needle, sizeof needle, "\"t\": \"%s\"", type);
  return std::strstr(s, needle) != nullptr;
}

bool jsonNumberAfterKey(const char* s, const char* key, double& out)
{
  const char* p = std::strstr(s, key);
  if (!p)
    return false;
  p = std::strchr(p, ':');
  if (!p)
    return false;
  ++p;
  while (*p == ' ' || *p == '\t')
    ++p;
  char* end = nullptr;
  out = std::strtod(p, &end);
  return end != p;
}

void handlePluginLine(const std::string& line)
{
  if (line.empty())
    return;
  if (jsonHasType(line.c_str(), "_size"))
  {
    double w = 0.0;
    double h = 0.0;
    if (jsonNumberAfterKey(line.c_str(), "\"w\"", w)
        && jsonNumberAfterKey(line.c_str(), "\"h\"", h))
    {
      g.width = static_cast<int>(w);
      g.height = static_cast<int>(h);
      syncNativeSize();
    }
    return;
  }
  evalJs(line.c_str());
}

void onUriScheme(WebKitURISchemeRequest* request, gpointer)
{
  const char* path = webkit_uri_scheme_request_get_path(request);
  if (!path || !path[0] || !std::strcmp(path, "/"))
    path = "/index.html";
  std::string rel = path;
  if (!rel.empty() && rel[0] == '/')
    rel.erase(0, 1);
  if (rel.rfind("bundle/", 0) == 0)
    rel.erase(0, 7);
  if (rel.empty())
    rel = "index.html";
  if (const auto hash = rel.find('#'); hash != std::string::npos)
    rel.resize(hash);
  if (rel.empty())
    rel = "index.html";

  char full[4096];
  std::snprintf(full, sizeof full, "%s/%s", g.webRoot, rel.c_str());

  GError* err = nullptr;
  GFile* file = g_file_new_for_path(full);
  GFileInputStream* stream = g_file_read(file, nullptr, &err);
  if (!stream)
  {
    hostLog("[calfnxt-web-host] uri-scheme MISS %s (%s)\n", full,
            err && err->message ? err->message : "?");
    webkit_uri_scheme_request_finish_error(request, err);
    if (err)
      g_error_free(err);
    g_object_unref(file);
    return;
  }
  if (envFlag("CALFNXT_WEB_DEBUG"))
    hostLog("[calfnxt-web-host] uri-scheme OK calfnxt://bundle/%s → %s\n", rel.c_str(), full);
  GFileInfo* info =
    g_file_query_info(file, G_FILE_ATTRIBUTE_STANDARD_SIZE, G_FILE_QUERY_INFO_NONE, nullptr, nullptr);
  const goffset size = info ? g_file_info_get_size(info) : -1;
  if (info)
    g_object_unref(info);

  const char* mime = "text/html";
  if (std::strstr(full, ".js"))
    mime = "text/javascript";
  else if (std::strstr(full, ".css"))
    mime = "text/css";
  else if (std::strstr(full, ".svg"))
    mime = "image/svg+xml";
  else if (std::strstr(full, ".png"))
    mime = "image/png";
  else if (std::strstr(full, ".woff2"))
    mime = "font/woff2";
  else if (std::strstr(full, ".ttf"))
    mime = "font/ttf";

  auto* headers = soup_message_headers_new(SOUP_MESSAGE_HEADERS_RESPONSE);
  soup_message_headers_append(headers, "Access-Control-Allow-Origin", "*");
  auto* response = webkit_uri_scheme_response_new(G_INPUT_STREAM(stream), size);
  webkit_uri_scheme_response_set_status(response, SOUP_STATUS_OK, nullptr);
  webkit_uri_scheme_response_set_content_type(response, mime);
  webkit_uri_scheme_response_set_http_headers(response, headers);
  webkit_uri_scheme_request_finish_with_response(request, response);
  g_object_unref(response);
  g_object_unref(stream);
  g_object_unref(file);
}

void onScriptMessage(WebKitUserContentManager*, WebKitJavascriptResult* js, gpointer)
{
  JSCValue* value = webkit_javascript_result_get_js_value(js);
  if (!value)
    return;
  char* s = jsc_value_is_string(value) ? jsc_value_to_string(value) : jsc_value_to_json(value, 0);
  if (!s)
    return;
  sendLine(s);
  g_free(s);
}

void onLoadChanged(WebKitWebView*, WebKitLoadEvent ev, gpointer)
{
  if (ev == WEBKIT_LOAD_STARTED)
  {
    if (envFlag("CALFNXT_WEB_DEBUG"))
      hostLog("[calfnxt-web-host] load-started\n");
  }
  else if (ev == WEBKIT_LOAD_COMMITTED)
  {
    if (envFlag("CALFNXT_WEB_DEBUG"))
      hostLog("[calfnxt-web-host] load-committed\n");
  }
  else if (ev == WEBKIT_LOAD_FINISHED)
  {
    hostLog("[calfnxt-web-host] load-finished → _ready\n");
    if (gtkAllocTiny())
      forceGtkAllocation("load-finished");
    enablePresent("load-finished");
    startMapPoll();
    reportSocketSize("load-finished");
    sendLine("{\"t\":\"_ready\"}");
    if (envFlag("CALFNXT_WEB_DEBUG"))
    {
      probeJsSize("load-finished");
      scheduleJsProbes();
    }
  }
}

void onWebProcessTerminated(WebKitWebView*, WebKitWebProcessTerminationReason reason, gpointer)
{
  hostLog("[calfnxt-web-host] web process terminated (reason=%d) — reloading\n",
          static_cast<int>(reason));
  if (!g.webview)
    return;
  char uri[512];
  std::snprintf(uri, sizeof uri, "calfnxt://bundle/%s", g.entryHtml);
  webkit_web_view_load_uri(g.webview, uri);
}

gboolean onSocketReadable(gint /*fd*/, GIOCondition condition, gpointer)
{
  if (condition & (G_IO_ERR | G_IO_HUP | G_IO_NVAL))
  {
    gtk_main_quit();
    return G_SOURCE_REMOVE;
  }
  if (!(condition & G_IO_IN))
    return G_SOURCE_CONTINUE;

  char chunk[8192];
  for (;;)
  {
    const ssize_t n = ::read(g.sock, chunk, sizeof chunk);
    if (n < 0)
    {
      if (errno == EINTR)
        continue;
      if (errno == EAGAIN || errno == EWOULDBLOCK)
        break;
      gtk_main_quit();
      return G_SOURCE_REMOVE;
    }
    if (n == 0)
    {
      gtk_main_quit();
      return G_SOURCE_REMOVE;
    }
    g.readBuf.append(chunk, static_cast<size_t>(n));
    for (;;)
    {
      const auto pos = g.readBuf.find('\n');
      if (pos == std::string::npos)
        break;
      std::string line = g.readBuf.substr(0, pos);
      g.readBuf.erase(0, pos + 1);
      while (!line.empty() && (line.back() == '\r' || line.back() == ' '))
        line.pop_back();
      handlePluginLine(line);
    }
  }
  return G_SOURCE_CONTINUE;
}

void printUsage(const char* argv0)
{
  std::fprintf(stderr,
               "Usage: %s --fd N --parent XID --root DIR --entry HTML "
               "[--width W] [--height H]\n",
               argv0);
}

} // namespace

int main(int argc, char** argv)
{
  unsigned long long parentXid = 0;
  int fd = -1;

  for (int i = 1; i < argc; ++i)
  {
    auto need = [&](const char* opt) -> const char* {
      if (i + 1 >= argc)
      {
        std::fprintf(stderr, "[calfnxt-web-host] missing value for %s\n", opt);
        std::exit(2);
      }
      return argv[++i];
    };
    if (!std::strcmp(argv[i], "--fd"))
      fd = std::atoi(need("--fd"));
    else if (!std::strcmp(argv[i], "--parent"))
      parentXid = std::strtoull(need("--parent"), nullptr, 10);
    else if (!std::strcmp(argv[i], "--root"))
      std::snprintf(g.webRoot, sizeof g.webRoot, "%s", need("--root"));
    else if (!std::strcmp(argv[i], "--entry"))
      std::snprintf(g.entryHtml, sizeof g.entryHtml, "%s", need("--entry"));
    else if (!std::strcmp(argv[i], "--width"))
      g.width = std::atoi(need("--width"));
    else if (!std::strcmp(argv[i], "--height"))
      g.height = std::atoi(need("--height"));
    else if (!std::strcmp(argv[i], "--help") || !std::strcmp(argv[i], "-h"))
    {
      printUsage(argv[0]);
      return 0;
    }
    else
    {
      std::fprintf(stderr, "[calfnxt-web-host] unknown arg: %s\n", argv[i]);
      printUsage(argv[0]);
      return 2;
    }
  }

  if (fd < 0 || parentXid == 0 || !g.webRoot[0] || !g.entryHtml[0])
  {
    printUsage(argv[0]);
    return 2;
  }
  g.sock = fd;
  g.parentXid = static_cast<unsigned long>(parentXid);
  {
    const int flags = fcntl(g.sock, F_GETFL, 0);
    if (flags >= 0)
      fcntl(g.sock, F_SETFL, flags | O_NONBLOCK);
  }

  gdk_set_allowed_backends("x11");
  if (!gtk_init_check(&argc, &argv))
  {
    std::fprintf(stderr, "[calfnxt-web-host] gtk_init_check failed\n");
    return 1;
  }

  hostLog("[calfnxt-web-host] start parent=0x%llx root=%s entry=%s %dx%d\n",
          static_cast<unsigned long long>(parentXid), g.webRoot, g.entryHtml, g.width, g.height);

  g.ctx = webkit_web_context_new();
  webkit_web_context_register_uri_scheme(g.ctx, "calfnxt", onUriScheme, nullptr, nullptr);
  auto* sec = webkit_web_context_get_security_manager(g.ctx);
  webkit_security_manager_register_uri_scheme_as_local(sec, "calfnxt");
  webkit_security_manager_register_uri_scheme_as_secure(sec, "calfnxt");
  webkit_security_manager_register_uri_scheme_as_cors_enabled(sec, "calfnxt");

  auto* ucm = webkit_user_content_manager_new();
  g_signal_connect(ucm, "script-message-received::calfnxt", G_CALLBACK(onScriptMessage), nullptr);
  webkit_user_content_manager_register_script_message_handler(ucm, "calfnxt");

  static const char bridge[] =
    "window.__calfnxtHostQ=window.__calfnxtHostQ||[];"
    "window.__calfnxtOnHost=window.__calfnxtOnHost||function(m){window.__calfnxtHostQ.push(m);};"
    "window.calfnxtNative={post:function(m){"
    "var src=typeof m==='string'?JSON.parse(m):m;"
    "var o={t:src.t};"
    "if(src.id!=null&&src.t!=='vizcfg')o.id=src.id|0;"
    "if(src.t==='set'&&typeof src.v==='number'){o.q=Math.round(src.v*1e6);o.d=1e6;}"
    "if(src.t==='viewport'){"
    "if(src.w!=null)o.w=src.w|0;if(src.h!=null)o.h=src.h|0;"
    "}"
    "if(src.t==='_diag'){"
    "if(src.msg!=null)o.msg=String(src.msg);"
    "if(src.w!=null)o.w=src.w|0;if(src.h!=null)o.h=src.h|0;"
    "}"
    "if(src.t==='vizcfg'){"
    "if(src.id!=null)o.id=String(src.id);if(src.bins!=null)o.bins=src.bins|0;"
    "}"
    "window.webkit.messageHandlers.calfnxt.postMessage(JSON.stringify(o));}};"
    ;
  auto* script = webkit_user_script_new(bridge, WEBKIT_USER_CONTENT_INJECT_TOP_FRAME,
                                        WEBKIT_USER_SCRIPT_INJECT_AT_DOCUMENT_START, nullptr, nullptr);
  webkit_user_content_manager_add_script(ucm, script);
  webkit_user_script_unref(script);

  // Ensure page chrome is opaque even if the SPA CSS loads late.
  {
    static const char css[] =
      "html,body,#root{background:#000!important;min-width:100%;min-height:100%;}";
    auto* style = webkit_user_style_sheet_new(css, WEBKIT_USER_CONTENT_INJECT_TOP_FRAME,
                                              WEBKIT_USER_STYLE_LEVEL_AUTHOR, nullptr, nullptr);
    webkit_user_content_manager_add_style_sheet(ucm, style);
    webkit_user_style_sheet_unref(style);
  }

  g.webview = WEBKIT_WEB_VIEW(g_object_new(WEBKIT_TYPE_WEB_VIEW, "web-context", g.ctx,
                                          "user-content-manager", ucm, nullptr));
  g_object_unref(ucm);

  auto* settings = webkit_web_view_get_settings(g.webview);
  const bool noGpu = envFlag("CALFNXT_WEB_NO_GPU");
  webkit_settings_set_hardware_acceleration_policy(
    settings,
    noGpu ? WEBKIT_HARDWARE_ACCELERATION_POLICY_NEVER
          : WEBKIT_HARDWARE_ACCELERATION_POLICY_ALWAYS);
  const bool webDebug = envFlag("CALFNXT_WEB_DEBUG") || envFlag("CALFNXT_WEB_INSPECTOR");
  webkit_settings_set_enable_developer_extras(settings, webDebug ? TRUE : FALSE);
  if (webDebug)
    webkit_settings_set_enable_write_console_messages_to_stdout(settings, TRUE);

  hostLog("[calfnxt-web-host] build=present-xwayland-1 hw-accel=%s\n", noGpu ? "never" : "always");
  if (envFlag("CALFNXT_WEB_DEBUG"))
  {
    hostLog("[calfnxt-web-host] env dmabuf_disable=%s compositing_disable=%s no_gpu=%s\n",
            std::getenv("WEBKIT_DISABLE_DMABUF_RENDERER") ? std::getenv("WEBKIT_DISABLE_DMABUF_RENDERER")
                                                            : "(unset)",
            std::getenv("WEBKIT_DISABLE_COMPOSITING_MODE") ? std::getenv("WEBKIT_DISABLE_COMPOSITING_MODE")
                                                           : "(unset)",
            noGpu ? "1" : "(unset)");
  }

  // Opaque WebView clear color (does not fix XEmbed present; helps if paint works).
  {
    GdkRGBA bg {0.0, 0.0, 0.0, 1.0};
    webkit_web_view_set_background_color(g.webview, &bg);
  }

  g.plug = gtk_plug_new(static_cast<Window>(parentXid));
  gtk_widget_set_size_request(g.plug, g.width, g.height);
  gtk_container_add(GTK_CONTAINER(g.plug), GTK_WIDGET(g.webview));
  gtk_widget_set_hexpand(GTK_WIDGET(g.webview), TRUE);
  gtk_widget_set_vexpand(GTK_WIDGET(g.webview), TRUE);

  // If the socket keeps handing us 1×1, re-apply Gdk-sized allocation on idle.
  g_signal_connect(g.plug, "size-allocate",
                   G_CALLBACK(+[](GtkWidget*, GdkRectangle* allocation, gpointer) {
                     if (g.inSizeAllocate)
                       return;
                     if (allocation && allocation->width >= 2 && allocation->height >= 2)
                       return;
                     scheduleForceAlloc();
                   }),
                   nullptr);

  auto onRealize = +[](GtkWidget* widget, gpointer) {
    disableFrameSync(widget);
    holdFrameClock();
  };
  g_signal_connect(g.plug, "realize", G_CALLBACK(onRealize), nullptr);
  g_signal_connect(GTK_WIDGET(g.webview), "realize", G_CALLBACK(onRealize), nullptr);

  gtk_widget_show_all(g.plug);
  syncNativeSize();
  if (gtkAllocTiny())
    scheduleForceAlloc();
  // Start ASAP: tester never becomes Viewable without an explicit map.
  startMapPoll();

  g_signal_connect(g.webview, "load-changed", G_CALLBACK(onLoadChanged), nullptr);
  g_signal_connect(g.webview, "web-process-terminated", G_CALLBACK(onWebProcessTerminated), nullptr);
  g_signal_connect(g.webview, "load-failed",
                   G_CALLBACK(+[](WebKitWebView*, WebKitLoadEvent, const gchar* failingUri,
                                  GError* error, gpointer) -> gboolean {
                     hostLog("[calfnxt-web-host] load-failed: %s (%s)\n",
                             failingUri ? failingUri : "?",
                             error && error->message ? error->message : "?");
                     return FALSE;
                   }),
                   nullptr);

  char uri[512];
  std::snprintf(uri, sizeof uri, "calfnxt://bundle/%s", g.entryHtml);
  hostLog("[calfnxt-web-host] load %s\n", uri);
  webkit_web_view_load_uri(g.webview, uri);

  if (envFlag("CALFNXT_WEB_INSPECTOR"))
  {
    auto* inspector = webkit_web_view_get_inspector(g.webview);
    webkit_web_inspector_show(inspector);
  }

  g.sockSource = g_unix_fd_add(g.sock, static_cast<GIOCondition>(G_IO_IN | G_IO_ERR | G_IO_HUP),
                               onSocketReadable, nullptr);

  gtk_main();

  if (g.sockSource)
    g_source_remove(g.sockSource);
  releaseFrameClock();
  if (g.plug)
  {
    gtk_widget_destroy(g.plug);
    g.plug = nullptr;
    g.webview = nullptr;
  }
  if (g.ctx)
  {
    g_object_unref(g.ctx);
    g.ctx = nullptr;
  }
  if (g.sock >= 0)
  {
    ::close(g.sock);
    g.sock = -1;
  }
  return 0;
}
