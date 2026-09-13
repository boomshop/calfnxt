/**
 * calfnxt-web-host — out-of-process GtkPlug + WebKitGTK editor.
 *
 * Spawned by the VST3 module (no GTK in the host process). Speaks mixed
 * messages on an inherited Unix socket FD:
 *   plugin → host: newline JS one-liners, {"t":"_size",…}, or binary CNXV /
 *                  CNXB (batched) viz frames (see viz_bin.h) → Float32Array
 *   host → plugin: UI JSON from calfnxtNative.post, {"t":"_ready"},
 *                  {"t":"_socket","w","h"}, or {"t":"_visible","v":0|1}
 */

#include <gdk/gdkx.h>
#include <glib-unix.h>
#include <gtk/gtk.h>
#include <gtk/gtkx.h>
#include <jsc/jsc.h>
#include <webkit2/webkit2.h>

#include "ui_file_log.h"
#include "viz_bin.h"

#include <cerrno>
#include <cstdint>
#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <fcntl.h>
#include <string>
#include <unistd.h>
#include <vector>

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
  /** Ongoing parent-visibility watch (Ardour hides without removed()). */
  guint visibilityPollSource = 0;
  int lastParentVisible = -1; // -1 unknown, 0 hidden, 1 viewable
  bool webParked = false;
  /** Opt-in XWayland Configure nudge (`CALFNXT_XWAYLAND_NUDGE`). */
  guint nudgeSource = 0;
  int nudgeTries = 0;
  guint liveNudgeSource = 0;
};

HostState g;

/** Map-poll interval: ~one frame, cheap, snappy for XEmbed hosts that never map. */
constexpr int kMapPollMs = 16;
/** Give up after ~2s so a stuck embedder cannot spin forever. */
constexpr int kMapPollMaxTries = 2000 / kMapPollMs;

void evalJs(const char* js);
bool sendLine(const char* line);

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
  calfNXT::Ui::appendUiLog(buf);
}

/** evalJs can fail on every param/viz line (~30–60 Hz); do not fill the log. */
void logEvalJsError(const char* message)
{
  static int64_t lastNs = 0;
  static int dropped = 0;
  timespec ts {};
  if (::clock_gettime(CLOCK_MONOTONIC, &ts) != 0)
  {
    hostLog("[calfnxt-web-host] evalJs: %s\n", message ? message : "?");
    return;
  }
  const int64_t now =
    static_cast<int64_t>(ts.tv_sec) * 1000000000LL + static_cast<int64_t>(ts.tv_nsec);
  if (lastNs != 0 && (now - lastNs) < 1000000000LL)
  {
    ++dropped;
    return;
  }
  lastNs = now;
  if (dropped > 0)
  {
    hostLog("[calfnxt-web-host] evalJs: %s (%d similar omitted)\n", message ? message : "?",
            dropped);
    dropped = 0;
    return;
  }
  hostLog("[calfnxt-web-host] evalJs: %s\n", message ? message : "?");
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

Display* x11Display()
{
  if (g.plug)
  {
    if (GdkWindow* win = gtk_widget_get_window(g.plug))
      return GDK_WINDOW_XDISPLAY(win);
  }
  if (GdkDisplay* gd = gdk_display_get_default())
    return GDK_DISPLAY_XDISPLAY(gd);
  return nullptr;
}

/** Host embed socket still shown? Ardour often unmaps this without removed(). */
bool parentEmbedVisible()
{
  if (!g.parentXid)
    return false;
  Display* dpy = x11Display();
  if (!dpy)
    return false;
  XWindowAttributes wa {};
  if (!XGetWindowAttributes(dpy, static_cast<Window>(g.parentXid), &wa))
    return false;
  if (wa.map_state != IsViewable)
    return false;
  return wa.width >= 2 && wa.height >= 2;
}

void notifyPageUiVisible(bool visible)
{
  if (!g.webview)
    return;
  char js[160];
  std::snprintf(js, sizeof js,
                "window.__calfnxtUiVisible=%s;"
                "try{document.dispatchEvent(new Event('calfnxt-visibility'));}catch(e){}",
                visible ? "true" : "false");
  evalJs(js);
}

void applyUiVisible(bool visible, const char* why)
{
  const int v = visible ? 1 : 0;
  if (g.lastParentVisible == v)
    return;
  const int prev = g.lastParentVisible;
  g.lastParentVisible = v;
  hostLog("[calfnxt-web-host] visible=%d (%s)\n", v, why ? why : "?");

  char line[64];
  std::snprintf(line, sizeof line, "{\"t\":\"_visible\",\"v\":%d}\n", v);
  sendLine(line);

  // After first known state: park/resume WebKit (do not exit — plugin must stay alive).
  if (g.webview && prev >= 0)
  {
    if (visible)
    {
      gtk_widget_show(GTK_WIDGET(g.webview));
      if (g.webParked)
      {
        char uri[512];
        std::snprintf(uri, sizeof uri, "calfnxt://bundle/%s", g.entryHtml);
        hostLog("[calfnxt-web-host] resume web process → %s\n", uri);
        webkit_web_view_load_uri(g.webview, uri);
        g.webParked = false;
      }
      notifyPageUiVisible(true);
    }
    else
    {
      // Park before terminate — otherwise web-process-terminated reloads immediately.
      g.webParked = true;
      webkit_web_view_terminate_web_process(g.webview);
      gtk_widget_hide(GTK_WIDGET(g.webview));
      notifyPageUiVisible(false);
    }
  }
  else if (visible)
    notifyPageUiVisible(true);

  if (!visible && g.liveNudgeSource)
  {
    g_source_remove(g.liveNudgeSource);
    g.liveNudgeSource = 0;
  }
}

gboolean onVisibilityPoll(gpointer)
{
  applyUiVisible(parentEmbedVisible(), "poll");
  return G_SOURCE_CONTINUE;
}

void startVisibilityPoll()
{
  if (g.visibilityPollSource)
    return;
  // Immediate sample, then 250 ms — cheap XGetWindowAttributes.
  applyUiVisible(parentEmbedVisible(), "start");
  g.visibilityPollSource = g_timeout_add(250, onVisibilityPoll, nullptr);
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

void exposeXid(Display* dpy, Window xid)
{
  if (!dpy || !xid)
    return;
  GdkDisplay* gd = gdk_display_get_default();
  if (gd)
    gdk_x11_display_error_trap_push(gd);
  XClearArea(dpy, xid, 0, 0, 0, 0, True);
  XFlush(dpy);
  if (gd)
  {
    const gint err = gdk_x11_display_error_trap_pop(gd);
    if (err && envFlag("CALFNXT_WEB_DEBUG"))
      hostLog("[calfnxt-web-host] expose xid=0x%lx xerr=%d\n", static_cast<unsigned long>(xid),
              static_cast<int>(err));
  }
}

void bumpGdkSize(GtkWidget* widget, int w, int h)
{
  if (!widget || w < 2 || h < 2)
    return;
  GdkWindow* win = gtk_widget_get_window(widget);
  if (!win)
    return;
  gdk_window_resize(win, w, h + 1);
  gdk_window_resize(win, w, h);
}

/** Same class of event as a user resize. Do not XResize the foreign parent. */
void syntheticConfigure(const char* why)
{
  int w = g.width;
  int h = g.height;
  Display* dpy = nullptr;
  if (g.plug)
  {
    if (GdkWindow* win = gtk_widget_get_window(g.plug))
    {
      int gw = 0;
      int gh = 0;
      gdk_window_get_geometry(win, nullptr, nullptr, &gw, &gh);
      if (gw >= 2 && gh >= 2)
      {
        w = gw;
        h = gh;
      }
      dpy = GDK_WINDOW_XDISPLAY(win);
      bumpGdkSize(g.plug, w, h);
      exposeXid(dpy, gdk_x11_window_get_xid(win));
    }
  }
  if (g.webview)
    bumpGdkSize(GTK_WIDGET(g.webview), w, h);
  if (dpy && g.parentXid)
    exposeXid(dpy, static_cast<Window>(g.parentXid));
  if (why)
    hostLog("[calfnxt-web-host] nudge %s %dx%d\n", why, w, h);
}

gboolean onLiveNudge(gpointer)
{
  if (!g.plug)
  {
    g.liveNudgeSource = 0;
    return G_SOURCE_REMOVE;
  }
  syntheticConfigure(nullptr);
  return G_SOURCE_CONTINUE;
}

void startLiveNudge()
{
  if (g.liveNudgeSource || !envFlag("CALFNXT_XWAYLAND_NUDGE"))
    return;
  g.liveNudgeSource = g_timeout_add(33, onLiveNudge, nullptr);
  hostLog("[calfnxt-web-host] nudge live-cfg 33ms\n");
}

gboolean onNudge(gpointer)
{
  ++g.nudgeTries;
  char why[24];
  std::snprintf(why, sizeof why, "cfg-%d", g.nudgeTries);
  syntheticConfigure(why);
  if (g.nudgeTries >= 4)
  {
    g.nudgeSource = 0;
    startLiveNudge();
    return G_SOURCE_REMOVE;
  }
  return G_SOURCE_CONTINUE;
}

void scheduleNudge()
{
  if (g.nudgeSource || g.liveNudgeSource)
    return;
  if (!envFlag("CALFNXT_XWAYLAND_NUDGE"))
    return;
  g.nudgeTries = 0;
  g.nudgeSource = g_timeout_add(80, onNudge, nullptr);
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
    reportSocketSize("map-ok");
    startVisibilityPoll();
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
    reportSocketSize("map-ok");
    startVisibilityPoll();
    return G_SOURCE_REMOVE;
  }

  if (g.mapPollTries >= kMapPollMaxTries)
  {
    hostLog("[calfnxt-web-host] map-give-up after %d polls (~%d ms) plug=%d webview=%d\n",
            g.mapPollTries, g.mapPollTries * kMapPollMs, x11MapState(g.plug),
            g.webview ? x11MapState(GTK_WIDGET(g.webview)) : -1);
    g.mapPollSource = 0;
    startVisibilityPoll();
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
    startVisibilityPoll();
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
        logEvalJsError(error->message);
        g_error_free(error);
      }
      if (value)
        g_object_unref(value);
    },
    nullptr);
}

/** Inject viz payload — tiny JS body; samples as base64 + fmt/scale/bias (no float parse). */
void injectVizBin(const calfNXT::Ui::VizBin::Decoded& dec)
{
  if (!g.webview || dec.id.empty() || dec.kind.empty() || dec.count < 0)
    return;
  if (dec.count > 0 && !dec.payload)
    return;

  const gsize nbytes =
    static_cast<gsize>(dec.count) * calfNXT::Ui::VizBin::bytesPerSample(dec.fmt);
  gchar* b64 = nullptr;
  if (nbytes > 0)
  {
    b64 = g_base64_encode(dec.payload, nbytes);
    if (!b64)
      return;
  }

  GVariantDict dict;
  g_variant_dict_init(&dict, nullptr);
  g_variant_dict_insert(&dict, "id", "s", dec.id.c_str());
  g_variant_dict_insert(&dict, "kind", "s", dec.kind.c_str());
  g_variant_dict_insert(&dict, "fmt", "u", static_cast<guint32>(dec.fmt));
  g_variant_dict_insert(&dict, "scale", "d", static_cast<gdouble>(dec.scale));
  g_variant_dict_insert(&dict, "bias", "d", static_cast<gdouble>(dec.bias));
  g_variant_dict_insert(&dict, "n", "u", static_cast<guint32>(dec.count));
  g_variant_dict_insert(&dict, "b64", "s", b64 ? b64 : "");
  GVariant* args = g_variant_ref_sink(g_variant_dict_end(&dict));
  g_free(b64);

  // Named args: id, kind, fmt, scale, bias, n, b64.
  // fmt: 0=f32 1=i16 2=u8 3=i8 — expand to Float32Array for the SPA.
  static const char body[] =
    "const s=atob(b64);"
    "const u8=new Uint8Array(s.length);"
    "for(let i=0;i<s.length;++i)u8[i]=s.charCodeAt(i);"
    "const v=new Float32Array(n|0);"
    "const sc=+scale,bi=+bias,f=fmt|0;"
    "if(f===0){const src=new Float32Array(u8.buffer,u8.byteOffset,n|0);"
    "v.set(src);}"
    "else if(f===1){const src=new Int16Array(u8.buffer,u8.byteOffset,n|0);"
    "for(let i=0;i<v.length;++i)v[i]=src[i]*sc+bi;}"
    "else if(f===3){const src=new Int8Array(u8.buffer,u8.byteOffset,n|0);"
    "for(let i=0;i<v.length;++i)v[i]=src[i]*sc+bi;}"
    "else{for(let i=0;i<v.length;++i)v[i]=u8[i]*sc+bi;}"
    "const m={t:'viz',id:id,kind:kind,v:v};"
    "if(window.__calfnxtVizDump)window.__calfnxtVizDump[String(id)+':'+String(kind)]=v;"
    "if(window.__calfnxtOnHost)window.__calfnxtOnHost(m);"
    "else{(window.__calfnxtHostQ=window.__calfnxtHostQ||[]).push(m);}";

  webkit_web_view_call_async_javascript_function(
    g.webview, body, -1, args, nullptr, nullptr, nullptr,
    +[](GObject* object, GAsyncResult* result, gpointer) {
      GError* error = nullptr;
      JSCValue* value =
        webkit_web_view_call_async_javascript_function_finish(WEBKIT_WEB_VIEW(object), result, &error);
      if (error)
      {
        logEvalJsError(error->message);
        g_error_free(error);
      }
      if (value)
        g_object_unref(value);
    },
    nullptr);
  g_variant_unref(args);
}

/** Append one decoded CNXV into a JS-side pack (id/kind/fmt/scale/bias/count/payload). */
void appendVizPackItem(std::vector<std::uint8_t>& pack, const calfNXT::Ui::VizBin::Decoded& dec)
{
  namespace VB = calfNXT::Ui::VizBin;
  const auto idLen = static_cast<std::uint8_t>(std::min(dec.id.size(), VB::kMaxIdLen));
  const auto kindLen = static_cast<std::uint8_t>(std::min(dec.kind.size(), VB::kMaxKindLen));
  const std::size_t bps = VB::bytesPerSample(dec.fmt);
  const std::size_t payload = static_cast<std::size_t>(std::max(0, dec.count)) * bps;

  const std::size_t at = pack.size();
  pack.resize(at + 1 + idLen + 1 + kindLen + 1 + 4 + 4 + 4 + payload);
  std::uint8_t* p = pack.data() + at;
  *p++ = idLen;
  if (idLen)
    std::memcpy(p, dec.id.data(), idLen);
  p += idLen;
  *p++ = kindLen;
  if (kindLen)
    std::memcpy(p, dec.kind.data(), kindLen);
  p += kindLen;
  *p++ = static_cast<std::uint8_t>(dec.fmt);
  auto writeF32 = [](std::uint8_t* d, float v) {
    static_assert(sizeof(float) == 4, "float");
    std::memcpy(d, &v, 4);
  };
  auto writeU32 = [](std::uint8_t* d, std::uint32_t v) {
    d[0] = static_cast<std::uint8_t>(v);
    d[1] = static_cast<std::uint8_t>(v >> 8);
    d[2] = static_cast<std::uint8_t>(v >> 16);
    d[3] = static_cast<std::uint8_t>(v >> 24);
  };
  writeF32(p, dec.scale);
  p += 4;
  writeF32(p, dec.bias);
  p += 4;
  writeU32(p, static_cast<std::uint32_t>(std::max(0, dec.count)));
  p += 4;
  if (payload && dec.payload)
    std::memcpy(p, dec.payload, payload);
}

/** One WebKit round-trip for many CNXV frames (CNXB batch). */
void injectVizBinBatch(const std::vector<calfNXT::Ui::VizBin::Decoded>& frames)
{
  if (!g.webview || frames.empty())
    return;
  if (frames.size() == 1)
  {
    injectVizBin(frames[0]);
    return;
  }

  std::vector<std::uint8_t> pack;
  pack.reserve(4096);
  // u32 little-endian item count
  pack.resize(4);
  const auto nItems = static_cast<std::uint32_t>(frames.size());
  pack[0] = static_cast<std::uint8_t>(nItems);
  pack[1] = static_cast<std::uint8_t>(nItems >> 8);
  pack[2] = static_cast<std::uint8_t>(nItems >> 16);
  pack[3] = static_cast<std::uint8_t>(nItems >> 24);
  for (const auto& fr : frames)
    appendVizPackItem(pack, fr);

  gchar* b64 = g_base64_encode(pack.data(), pack.size());
  if (!b64)
    return;

  GVariantDict dict;
  g_variant_dict_init(&dict, nullptr);
  g_variant_dict_insert(&dict, "b64", "s", b64);
  GVariant* args = g_variant_ref_sink(g_variant_dict_end(&dict));
  g_free(b64);

  // One atob → N viz messages (DataView avoids TypedArray alignment traps).
  static const char body[] =
    "const s=atob(b64);"
    "const u8=new Uint8Array(s.length);"
    "for(let i=0;i<s.length;++i)u8[i]=s.charCodeAt(i);"
    "const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);"
    "let o=0;"
    "const nItems=dv.getUint32(o,true);o+=4;"
    "const deliver=function(id,kind,v){"
    "const m={t:'viz',id:id,kind:kind,v:v};"
    "if(window.__calfnxtVizDump)window.__calfnxtVizDump[String(id)+':'+String(kind)]=v;"
    "if(window.__calfnxtOnHost)window.__calfnxtOnHost(m);"
    "else{(window.__calfnxtHostQ=window.__calfnxtHostQ||[]).push(m);}"
    "};"
    "for(let fi=0;fi<nItems;++fi){"
    "const idLen=u8[o++];"
    "let id='';for(let i=0;i<idLen;++i)id+=String.fromCharCode(u8[o++]);"
    "const kindLen=u8[o++];"
    "let kind='';for(let i=0;i<kindLen;++i)kind+=String.fromCharCode(u8[o++]);"
    "const f=u8[o++];"
    "const sc=dv.getFloat32(o,true);o+=4;"
    "const bi=dv.getFloat32(o,true);o+=4;"
    "const cn=dv.getUint32(o,true);o+=4;"
    "const v=new Float32Array(cn);"
    "if(f===0){for(let i=0;i<cn;++i){v[i]=dv.getFloat32(o,true);o+=4;}}"
    "else if(f===1){for(let i=0;i<cn;++i){v[i]=dv.getInt16(o,true)*sc+bi;o+=2;}}"
    "else if(f===3){for(let i=0;i<cn;++i){v[i]=dv.getInt8(o)*sc+bi;o+=1;}}"
    "else{for(let i=0;i<cn;++i){v[i]=u8[o++]*sc+bi;}}"
    "deliver(id,kind,v);"
    "}";

  webkit_web_view_call_async_javascript_function(
    g.webview, body, -1, args, nullptr, nullptr, nullptr,
    +[](GObject* object, GAsyncResult* result, gpointer) {
      GError* error = nullptr;
      JSCValue* value =
        webkit_web_view_call_async_javascript_function_finish(WEBKIT_WEB_VIEW(object), result, &error);
      if (error)
      {
        logEvalJsError(error->message);
        g_error_free(error);
      }
      if (value)
        g_object_unref(value);
    },
    nullptr);
  g_variant_unref(args);
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
  if (jsonHasType(line.c_str(), "_folder"))
  {
    GtkWindow* parent = g.plug ? GTK_WINDOW(g.plug) : nullptr;
    GtkFileChooserNative* native = gtk_file_chooser_native_new(
      "IR Library", parent, GTK_FILE_CHOOSER_ACTION_SELECT_FOLDER, "_Open", "_Cancel");
    if (!native)
      return;
    const int res = gtk_native_dialog_run(GTK_NATIVE_DIALOG(native));
    if (res == GTK_RESPONSE_ACCEPT)
    {
      char* folder =
        gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(native));
      if (folder && folder[0])
      {
        std::string json = "{\"t\":\"_folder\",\"path\":\"";
        for (const char* p = folder; *p; ++p)
        {
          if (*p == '\\' || *p == '"')
            json.push_back('\\');
          json.push_back(*p);
        }
        json += "\"}";
        sendLine(json.c_str());
      }
      g_free(folder);
    }
    g_object_unref(native);
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
    scheduleNudge();
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
  if (g.webParked)
  {
    hostLog("[calfnxt-web-host] web process terminated (reason=%d) — parked, no reload\n",
            static_cast<int>(reason));
    return;
  }
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
      if (calfNXT::Ui::VizBin::looksLikeBatchMagic(g.readBuf.data(), g.readBuf.size()))
      {
        std::uint32_t frameCount = 0;
        const char* payload = nullptr;
        std::size_t payloadBytes = 0;
        std::size_t batchBytes = 0;
        bool corrupt = false;
        if (!calfNXT::Ui::VizBin::tryDecodeBatch(g.readBuf.data(), g.readBuf.size(), frameCount,
                                                 payload, payloadBytes, batchBytes, corrupt))
        {
          if (corrupt)
          {
            g.readBuf.erase(0, 1);
            continue;
          }
          break; // incomplete batch
        }

        std::vector<calfNXT::Ui::VizBin::Decoded> frames;
        frames.reserve(frameCount);
        std::size_t off = 0;
        bool ok = true;
        for (std::uint32_t i = 0; i < frameCount; ++i)
        {
          calfNXT::Ui::VizBin::Decoded dec;
          bool frameCorrupt = false;
          if (!calfNXT::Ui::VizBin::tryDecode(payload + off, payloadBytes - off, dec, frameCorrupt)
              || frameCorrupt)
          {
            ok = false;
            break;
          }
          frames.push_back(dec);
          off += dec.frameBytes;
        }
        if (ok)
          injectVizBinBatch(frames);
        g.readBuf.erase(0, batchBytes);
        continue;
      }

      if (calfNXT::Ui::VizBin::looksLikeMagic(g.readBuf.data(), g.readBuf.size()))
      {
        calfNXT::Ui::VizBin::Decoded dec;
        bool corrupt = false;
        if (!calfNXT::Ui::VizBin::tryDecode(g.readBuf.data(), g.readBuf.size(), dec, corrupt))
        {
          if (corrupt)
          {
            g.readBuf.erase(0, 1);
            continue;
          }
          break; // incomplete frame
        }
        injectVizBin(dec);
        g.readBuf.erase(0, dec.frameBytes);
        continue;
      }

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
    "window.__calfnxtUiVisible=true;"
    "window.__calfnxtVizDump=window.__calfnxtVizDump||{};"
    "window.__calfnxtDumpViz=function(){"
    "var json=JSON.stringify(window.__calfnxtVizDump||{},null,2);"
    "console.log(json);return json;};"
    "window.__calfnxtOnHost=window.__calfnxtOnHost||function(m){"
    "if(m&&m.t==='viz'&&m.id!=null&&Array.isArray(m.v))"
    "window.__calfnxtVizDump[String(m.id)+':'+String(m.kind)]=m.v;"
    "window.__calfnxtHostQ.push(m);};"
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
    "if(src.t==='vizhz'){"
    "if(src.hz!=null)o.hz=src.hz|0;"
    "}"
    "if(src.t==='ir'){"
    "if(src.cmd!=null)o.cmd=String(src.cmd);"
    "if(src.path!=null)o.path=String(src.path);"
    "}"
    "if(src.t==='midi'){"
    "if(src.cmd!=null)o.cmd=String(src.cmd);"
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

  hostLog("[calfnxt-web-host] build=nudge-opt-1 hw-accel=%s xwayland_nudge=%s\n",
          noGpu ? "never" : "always", envFlag("CALFNXT_XWAYLAND_NUDGE") ? "1" : "(unset)");
  if (envFlag("CALFNXT_WEB_DEBUG"))
  {
    hostLog("[calfnxt-web-host] env dmabuf_disable=%s compositing_disable=%s no_gpu=%s xwayland_nudge=%s\n",
            std::getenv("WEBKIT_DISABLE_DMABUF_RENDERER") ? std::getenv("WEBKIT_DISABLE_DMABUF_RENDERER")
                                                            : "(unset)",
            std::getenv("WEBKIT_DISABLE_COMPOSITING_MODE") ? std::getenv("WEBKIT_DISABLE_COMPOSITING_MODE")
                                                           : "(unset)",
            noGpu ? "1" : "(unset)",
            envFlag("CALFNXT_XWAYLAND_NUDGE") ? "1" : "(unset)");
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
  if (g.nudgeSource)
  {
    g_source_remove(g.nudgeSource);
    g.nudgeSource = 0;
  }
  if (g.liveNudgeSource)
  {
    g_source_remove(g.liveNudgeSource);
    g.liveNudgeSource = 0;
  }
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
