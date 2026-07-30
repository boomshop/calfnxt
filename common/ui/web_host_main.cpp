/**
 * calfnxt-web-host — out-of-process GtkPlug + WebKitGTK editor.
 *
 * Spawned by the VST3 module (no GTK in the host process). Speaks newline-
 * delimited messages on an inherited Unix socket FD:
 *   plugin → host: JS one-liners to evaluate, or {"t":"_size","w","h"}
 *   host → plugin: UI JSON from calfnxtNative.post, or {"t":"_ready"}
 */

#include <gdk/gdkx.h>
#include <glib-unix.h>
#include <gtk/gtk.h>
#include <gtk/gtkx.h>
#include <jsc/jsc.h>
#include <webkit2/webkit2.h>
#include <X11/Xlib.h>

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
  char pendingUri[512] {};
  int width = 360;
  int height = 420;
  unsigned long long parentXid = 0;
  GtkWidget* plug = nullptr;
  WebKitWebView* webview = nullptr;
  WebKitWebContext* ctx = nullptr;
  guint sockSource = 0;
  bool loadStarted = false;
  bool syncingSize = false;
  /** Monotonic ms deadline for size-kick timer (0 = inactive). */
  gint64 kickUntilMs = 0;
};

HostState g;

void syncNativeSize();
void armSizeKick(int ms = 8000);

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

void logAlloc(const char* why)
{
  const int pw = g.plug ? gtk_widget_get_allocated_width(g.plug) : -1;
  const int ph = g.plug ? gtk_widget_get_allocated_height(g.plug) : -1;
  const int vw = g.webview ? gtk_widget_get_allocated_width(GTK_WIDGET(g.webview)) : -1;
  const int vh = g.webview ? gtk_widget_get_allocated_height(GTK_WIDGET(g.webview)) : -1;
  const int emb = (g.plug && gtk_plug_get_embedded(GTK_PLUG(g.plug))) ? 1 : 0;
  int gdkW = -1;
  int gdkH = -1;
  int parW = -1;
  int parH = -1;
  if (g.plug)
  {
    if (GdkWindow* win = gtk_widget_get_window(g.plug))
    {
      gdk_window_get_geometry(win, nullptr, nullptr, &gdkW, &gdkH);
#if defined(GDK_WINDOWING_X11)
      if (GDK_IS_X11_WINDOW(win))
      {
        Display* dpy = GDK_WINDOW_XDISPLAY(win);
        const Window xid = GDK_WINDOW_XID(win);
        Window root = 0;
        Window parent = 0;
        Window* kids = nullptr;
        unsigned n = 0;
        if (XQueryTree(dpy, xid, &root, &parent, &kids, &n) && parent && parent != root)
        {
          Window r2 = 0;
          int x = 0, y = 0;
          unsigned w = 0, h = 0, bw = 0, depth = 0;
          if (XGetGeometry(dpy, parent, &r2, &x, &y, &w, &h, &bw, &depth))
          {
            parW = static_cast<int>(w);
            parH = static_cast<int>(h);
          }
        }
        if (kids)
          XFree(kids);
      }
#endif
    }
  }
  hostLog("[calfnxt-web-host] alloc %s plug=%dx%d webview=%dx%d gdk=%dx%d parent=%dx%d "
          "embedded=%d want=%dx%d\n",
          why, pw, ph, vw, vh, gdkW, gdkH, parW, parH, emb, g.width, g.height);
}

void resizeX11Window(GdkWindow* win, int w, int h)
{
  if (!win || w < 1 || h < 1)
    return;
  gdk_window_resize(win, w, h);
#if defined(GDK_WINDOWING_X11)
  if (GDK_IS_X11_WINDOW(win))
  {
    GdkDisplay* gd = gdk_window_get_display(win);
    Display* dpy = GDK_WINDOW_XDISPLAY(win);
    const Window xid = GDK_WINDOW_XID(win);
    // Trap: resizing our own XID is fine; never let X errors abort the helper.
    gdk_x11_display_error_trap_push(gd);
    XWindowChanges ch {};
    ch.width = w;
    ch.height = h;
    XConfigureWindow(dpy, xid, CWWidth | CWHeight, &ch);
    XResizeWindow(dpy, xid, static_cast<unsigned>(w), static_cast<unsigned>(h));
    XSync(dpy, False);
    const int err = gdk_x11_display_error_trap_pop(gd);
    if (err)
      hostLog("[calfnxt-web-host] resize-self X error code=%d (ignored)\n", err);
  }
#endif
}

/**
 * Grow the host XEmbed socket / undersized ancestors to match the editor size.
 * Always error-trapped (foreign XResize can BadAccess). Disable with
 * CALFNXT_WEB_NO_RESIZE_PARENT=1. Opt-out only — grow is required after HiDPI
 * resizeView so the plug fills the larger host frame.
 */
void resizeX11EmbedderChain(int w, int h)
{
  if (w < 1 || h < 1 || envFlag("CALFNXT_WEB_NO_RESIZE_PARENT"))
    return;
#if defined(GDK_WINDOWING_X11)
  GdkDisplay* gd = gdk_display_get_default();
  Display* dpy = gd ? gdk_x11_display_get_xdisplay(gd) : nullptr;
  if (!dpy)
    return;

  Window start = 0;
  if (g.plug)
  {
    if (GdkWindow* win = gtk_widget_get_window(g.plug))
    {
      if (GDK_IS_X11_WINDOW(win))
        start = GDK_WINDOW_XID(win);
    }
  }
  if (!start && g.parentXid)
    start = static_cast<Window>(g.parentXid);
  if (!start)
    return;

  XWindowChanges ch {};
  ch.width = w;
  ch.height = h;

  gdk_x11_display_error_trap_push(gd);

  if (g.parentXid)
  {
    const Window sock = static_cast<Window>(g.parentXid);
    Window r2 = 0;
    int x = 0, y = 0;
    unsigned pw = 0, ph = 0, bw = 0, d = 0;
    // Grow-only: never shrink a host socket that is already large enough.
    if (!XGetGeometry(dpy, sock, &r2, &x, &y, &pw, &ph, &bw, &d)
        || static_cast<int>(pw) < w || static_cast<int>(ph) < h)
    {
      XConfigureWindow(dpy, sock, CWWidth | CWHeight, &ch);
      XResizeWindow(dpy, sock, static_cast<unsigned>(w), static_cast<unsigned>(h));
    }
  }

  Window cur = start;
  for (int depth = 0; cur && depth < 8; ++depth)
  {
    Window root = 0;
    Window parent = 0;
    Window* kids = nullptr;
    unsigned n = 0;
    if (!XQueryTree(dpy, cur, &root, &parent, &kids, &n))
      break;
    if (kids)
      XFree(kids);
    if (!parent || parent == root)
      break;

    Window r2 = 0;
    int x = 0, y = 0;
    unsigned pw = 0, ph = 0, bw = 0, d = 0;
    if (XGetGeometry(dpy, parent, &r2, &x, &y, &pw, &ph, &bw, &d))
    {
      if (static_cast<int>(pw) >= w && static_cast<int>(ph) >= h)
        break;
    }
    XConfigureWindow(dpy, parent, CWWidth | CWHeight, &ch);
    XResizeWindow(dpy, parent, static_cast<unsigned>(w), static_cast<unsigned>(h));
    cur = parent;
  }
  XSync(dpy, False);
  const int err = gdk_x11_display_error_trap_pop(gd);
  if (err)
    hostLog("[calfnxt-web-host] resize-parent X error code=%d (ignored)\n", err);
#endif
}

void armSizeKick(int ms)
{
  g.kickUntilMs = g_get_monotonic_time() / 1000 + ms;
}

void syncNativeSize()
{
  if (!g.plug || g.syncingSize)
    return;
  const int w = g.width;
  const int h = g.height;
  if (w < 1 || h < 1)
    return;

  // Re-entrancy guard: size-allocate handlers call startLoadIfReady → syncNativeSize.
  // Forcing gtk_widget_size_allocate here previously recursed until SIGSEGV.
  g.syncingSize = true;

  gtk_widget_set_size_request(g.plug, w, h);
  if (GTK_IS_WINDOW(g.plug))
    gtk_window_resize(GTK_WINDOW(g.plug), w, h);

  if (g.webview)
  {
    webkit_web_view_set_zoom_level(g.webview, 1.0);
    gtk_widget_set_hexpand(GTK_WIDGET(g.webview), TRUE);
    gtk_widget_set_vexpand(GTK_WIDGET(g.webview), TRUE);
    gtk_widget_set_size_request(GTK_WIDGET(g.webview), w, h);
  }

  if (gtk_widget_get_realized(g.plug))
  {
    if (GdkWindow* win = gtk_widget_get_window(g.plug))
      resizeX11Window(win, w, h);
  }
  if (g.webview && gtk_widget_get_realized(GTK_WIDGET(g.webview)))
  {
    if (GdkWindow* win = gtk_widget_get_window(GTK_WIDGET(g.webview)))
      resizeX11Window(win, w, h);
  }
  resizeX11EmbedderChain(w, h);

  gtk_widget_queue_resize(g.plug);
  gtk_widget_queue_draw(g.plug);
  if (g.webview)
    gtk_widget_queue_draw(GTK_WIDGET(g.webview));

  g.syncingSize = false;
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

void startLoadIfReady(const char* why)
{
  if (g.loadStarted || !g.webview || !g.pendingUri[0])
    return;
  // Avoid sync↔size-allocate recursion; allocation may already be in progress.
  if (!g.syncingSize)
    syncNativeSize();
  logAlloc(why);
  const int vw = gtk_widget_get_allocated_width(GTK_WIDGET(g.webview));
  const int vh = gtk_widget_get_allocated_height(GTK_WIDGET(g.webview));
  int gdkW = -1;
  int gdkH = -1;
  if (GdkWindow* win = gtk_widget_get_window(GTK_WIDGET(g.webview)))
    gdk_window_get_geometry(win, nullptr, nullptr, &gdkW, &gdkH);
  // Prefer GTK allocation; fall back to Gdk/X geometry after forced resize.
  const int useW = vw >= 2 ? vw : gdkW;
  const int useH = vh >= 2 ? vh : gdkH;
  if (useW < 2 || useH < 2)
    return;
  g.loadStarted = true;
  hostLog("[calfnxt-web-host] load %s (alloc %dx%d via %s)\n", g.pendingUri, useW, useH, why);
  webkit_web_view_load_uri(g.webview, g.pendingUri);
}

void forceLoad(const char* why)
{
  if (g.loadStarted || !g.webview || !g.pendingUri[0])
    return;
  syncNativeSize();
  logAlloc(why);
  g.loadStarted = true;
  hostLog("[calfnxt-web-host] load %s (forced via %s)\n", g.pendingUri, why);
  webkit_web_view_load_uri(g.webview, g.pendingUri);
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
        std::fprintf(stderr, "[calfnxt-web-host] evalJs: %s\n", error->message);
        g_error_free(error);
      }
      if (value)
        g_object_unref(value);
    },
    nullptr);
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
      hostLog("[calfnxt-web-host] host _size %dx%d\n", g.width, g.height);
      syncNativeSize();
      logAlloc("host-_size");
      armSizeKick(8000);
      startLoadIfReady("host-_size");
      evalJs("try{window.dispatchEvent(new Event('resize'));}catch(e){}");
    }
    return;
  }
  evalJs(line.c_str());
}

void onUriScheme(WebKitURISchemeRequest* request, gpointer)
{
  const char* reqUri = webkit_uri_scheme_request_get_uri(request);
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
    hostLog("[calfnxt-web-host] uri-scheme MISS %s → %s (%s)\n",
            reqUri ? reqUri : "?", full, err && err->message ? err->message : "?");
    webkit_uri_scheme_request_finish_error(request, err);
    if (err)
      g_error_free(err);
    g_object_unref(file);
    return;
  }

  if (envFlag("CALFNXT_WEB_DEBUG"))
    hostLog("[calfnxt-web-host] uri-scheme OK %s → %s\n", reqUri ? reqUri : "?", full);

  GFileInfo* info =
    g_file_query_info(file, G_FILE_ATTRIBUTE_STANDARD_SIZE, G_FILE_QUERY_INFO_NONE, nullptr, nullptr);
  const goffset size = info ? g_file_info_get_size(info) : -1;
  if (info)
    g_object_unref(info);

  // ES modules on custom schemes are picky about MIME (esp. WebKitGTK ≥ 2.46).
  const char* mime = "text/html";
  if (std::strstr(full, ".js") || std::strstr(full, ".mjs"))
    mime = "application/javascript";
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
  soup_message_headers_append(headers, "Cache-Control", "no-cache");
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
  if (std::strstr(s, "\"t\":\"_jserr\"") || std::strstr(s, "\"t\": \"_jserr\"")
      || std::strstr(s, "\"t\":\"_diag\"") || std::strstr(s, "\"t\": \"_diag\""))
    hostLog("[calfnxt-web-host] UI msg: %s\n", s);
  sendLine(s);
  g_free(s);
}

void onLoadChanged(WebKitWebView*, WebKitLoadEvent ev, gpointer)
{
  if (ev == WEBKIT_LOAD_STARTED)
    hostLog("[calfnxt-web-host] load-started\n");
  else if (ev == WEBKIT_LOAD_COMMITTED)
    hostLog("[calfnxt-web-host] load-committed\n");
  else if (ev == WEBKIT_LOAD_FINISHED)
  {
    logAlloc("load-finished");
    hostLog("[calfnxt-web-host] load-finished → _ready\n");
    sendLine("{\"t\":\"_ready\"}");
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

  // WebKitGTK 2.42+ DMA-BUF renderer often paints a blank/transparent window on
  // X11 (NVIDIA and some other GPUs). Disable unless explicitly re-enabled.
  // Do NOT force WEBKIT_DISABLE_COMPOSITING_MODE here — with a successful load that
  // can leave an empty XEmbed surface while the web process still reports _ready.
  if (!envFlag("CALFNXT_WEB_DMABUF") && !std::getenv("WEBKIT_DISABLE_DMABUF_RENDERER"))
    setenv("WEBKIT_DISABLE_DMABUF_RENDERER", "1", 1);

  for (int i = 1; i < argc; ++i)
  {
    auto need = [&](const char* opt) -> const char* {
      if (i + 1 >= argc)
      {
        hostLog("[calfnxt-web-host] missing value for %s\n", opt);
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
      hostLog("[calfnxt-web-host] unknown arg: %s\n", argv[i]);
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
  g.parentXid = parentXid;
  {
    const int flags = fcntl(g.sock, F_GETFL, 0);
    if (flags >= 0)
      fcntl(g.sock, F_SETFL, flags | O_NONBLOCK);
  }

  // XEmbed / GtkPlug requires X11. Force the backend before GTK touches the display
  // (Wayland-only sessions without XWayland will fail gtk_init_check below).
  setenv("GDK_BACKEND", "x11", 1);
  gdk_set_allowed_backends("x11");
  if (!gtk_init_check(&argc, &argv))
  {
    hostLog("[calfnxt-web-host] gtk_init_check failed (need X11 DISPLAY / XWayland; "
            "GDK_BACKEND=x11)\n");
    return 1;
  }

  // Stamp proves ~/.vst3 helper was updated (tester logs often still show old binaries).
  hostLog("[calfnxt-web-host] build=geom-kick-7\n");
  hostLog("[calfnxt-web-host] start parent=0x%llx root=%s entry=%s %dx%d dmabuf=%s\n",
          static_cast<unsigned long long>(parentXid), g.webRoot, g.entryHtml, g.width, g.height,
          envFlag("CALFNXT_WEB_DMABUF") ? "on" : "off");

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
    "window.addEventListener('error',function(e){"
    "try{window.webkit.messageHandlers.calfnxt.postMessage(JSON.stringify({"
    "t:'_jserr',message:String(e.message||e),source:String(e.filename||''),line:e.lineno|0"
    "}));}catch(_e){}});"
    "window.addEventListener('unhandledrejection',function(e){"
    "try{window.webkit.messageHandlers.calfnxt.postMessage(JSON.stringify({"
    "t:'_jserr',message:String(e.reason&&e.reason.message||e.reason||'rejection')"
    "}));}catch(_e){}});"
    "window.calfnxtNative={post:function(m){"
    "var src=typeof m==='string'?JSON.parse(m):m;"
    "var o={t:src.t};"
    "if(src.id!=null&&src.t!=='vizcfg')o.id=src.id|0;"
    "if(src.t==='set'&&typeof src.v==='number'){o.q=Math.round(src.v*1e6);o.d=1e6;}"
    "if(src.t==='viewport'){"
    "if(src.w!=null)o.w=src.w|0;if(src.h!=null)o.h=src.h|0;"
    "}"
    "if(src.t==='vizcfg'){"
    "if(src.id!=null)o.id=String(src.id);if(src.bins!=null)o.bins=src.bins|0;"
    "}"
    "if(src.t==='_diag'||src.t==='_jserr'){"
    "if(src.message!=null)o.message=String(src.message);"
    "if(src.source!=null)o.source=String(src.source);"
    "if(src.line!=null)o.line=src.line|0;"
    "}"
    "window.webkit.messageHandlers.calfnxt.postMessage(JSON.stringify(o));}};"
    ;
  auto* script = webkit_user_script_new(bridge, WEBKIT_USER_CONTENT_INJECT_TOP_FRAME,
                                        WEBKIT_USER_SCRIPT_INJECT_AT_DOCUMENT_START, nullptr, nullptr);
  webkit_user_content_manager_add_script(ucm, script);
  webkit_user_script_unref(script);

  g.webview = WEBKIT_WEB_VIEW(g_object_new(WEBKIT_TYPE_WEB_VIEW, "web-context", g.ctx,
                                          "user-content-manager", ucm, nullptr));
  g_object_unref(ucm);

  // Opaque surface so a failed JS paint is a solid panel, not a transparent XEmbed hole.
  {
    GdkRGBA bg {0.11, 0.11, 0.12, 1.0};
    webkit_web_view_set_background_color(g.webview, &bg);
  }

  auto* settings = webkit_web_view_get_settings(g.webview);
  // XEmbed+WebKit GPU frequently paints a transparent "background hole". Default
  // software; opt in with CALFNXT_WEB_GPU=1 (CALFNXT_WEB_NO_GPU=1 still forces off).
  const bool wantGpu = envFlag("CALFNXT_WEB_GPU") && !envFlag("CALFNXT_WEB_NO_GPU");
  webkit_settings_set_hardware_acceleration_policy(
    settings,
    wantGpu ? WEBKIT_HARDWARE_ACCELERATION_POLICY_ALWAYS
            : WEBKIT_HARDWARE_ACCELERATION_POLICY_NEVER);
  const bool webDebug = envFlag("CALFNXT_WEB_DEBUG") || envFlag("CALFNXT_WEB_INSPECTOR");
  webkit_settings_set_enable_developer_extras(settings, webDebug ? TRUE : FALSE);
  if (webDebug)
    webkit_settings_set_enable_write_console_messages_to_stdout(settings, TRUE);

  hostLog("[calfnxt-web-host] hw-accel=%s debug=%d\n",
          wantGpu ? "always" : "never", webDebug ? 1 : 0);

  hostLog("[calfnxt-web-host] creating GtkPlug for parent=0x%llx\n",
          static_cast<unsigned long long>(parentXid));
  g.plug = gtk_plug_new(static_cast<Window>(parentXid));
  if (!g.plug)
  {
    hostLog("[calfnxt-web-host] gtk_plug_new failed\n");
    return 1;
  }
  gtk_widget_set_size_request(g.plug, g.width, g.height);
  gtk_container_add(GTK_CONTAINER(g.plug), GTK_WIDGET(g.webview));
  gtk_widget_set_hexpand(GTK_WIDGET(g.webview), TRUE);
  gtk_widget_set_vexpand(GTK_WIDGET(g.webview), TRUE);
  gtk_widget_set_size_request(GTK_WIDGET(g.webview), g.width, g.height);

  g_signal_connect(g.plug, "embedded",
                   G_CALLBACK(+[](GtkPlug*, gpointer) {
                     hostLog("[calfnxt-web-host] GtkPlug embedded into parent\n");
                     syncNativeSize();
                     startLoadIfReady("embedded");
                   }),
                   nullptr);
  g_signal_connect(g.plug, "size-allocate",
                   G_CALLBACK(+[](GtkWidget*, GdkRectangle*, gpointer) {
                     startLoadIfReady("plug-size-allocate");
                   }),
                   nullptr);
  g_signal_connect(GTK_WIDGET(g.webview), "size-allocate",
                   G_CALLBACK(+[](GtkWidget*, GdkRectangle*, gpointer) {
                     startLoadIfReady("webview-size-allocate");
                   }),
                   nullptr);

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

  std::snprintf(g.pendingUri, sizeof g.pendingUri, "calfnxt://bundle/%s", g.entryHtml);
  hostLog("[calfnxt-web-host] show_all…\n");
  gtk_widget_show_all(g.plug);
  hostLog("[calfnxt-web-host] syncNativeSize…\n");
  syncNativeSize();
  logAlloc("show_all");
  if (!gtk_plug_get_embedded(GTK_PLUG(g.plug)))
  {
    hostLog("[calfnxt-web-host] warning: GtkPlug not embedded yet (parent=0x%llx)\n",
            static_cast<unsigned long long>(parentXid));
  }
  startLoadIfReady("show_all");
  // Fallback: some hosts allocate late; don't hang forever without a document.
  g_timeout_add(750, +[](gpointer) -> gboolean {
    forceLoad("timeout-750ms");
    return G_SOURCE_REMOVE;
  }, nullptr);
  // Carla/Qt often leaves the XEmbed socket undersized after resizeView; keep
  // syncing until gdk matches want (or kick deadline expires).
  armSizeKick(8000);
  g_timeout_add(100, +[](gpointer) -> gboolean {
    static int ticks = 0;
    ++ticks;
    syncNativeSize();
    const int pw = g.plug ? gtk_widget_get_allocated_width(g.plug) : 0;
    const int ph = g.plug ? gtk_widget_get_allocated_height(g.plug) : 0;
    int gdkW = 0;
    int gdkH = 0;
    if (g.plug)
    {
      if (GdkWindow* win = gtk_widget_get_window(g.plug))
        gdk_window_get_geometry(win, nullptr, nullptr, &gdkW, &gdkH);
    }
    const bool usable = (pw >= 2 && ph >= 2) || (gdkW >= 2 && gdkH >= 2);
    const bool matched = usable
      && gdkW >= g.width - 2 && gdkW <= g.width + 2
      && gdkH >= g.height - 2 && gdkH <= g.height + 2;
    if (ticks == 1 || ticks == 5 || ticks == 15 || ticks % 20 == 0 || matched)
      logAlloc(matched ? "kick-match" : (usable ? "kick" : "kick-tiny"));
    const gint64 now = g_get_monotonic_time() / 1000;
    // Stay alive briefly after a match so a later HiDPI _size can re-arm via armSizeKick.
    if (matched)
    {
      const gint64 soon = now + 800;
      if (g.kickUntilMs <= 0 || g.kickUntilMs > soon)
        g.kickUntilMs = soon;
    }
    if (g.kickUntilMs > 0 && now > g.kickUntilMs)
      return G_SOURCE_REMOVE;
    return G_SOURCE_CONTINUE;
  }, nullptr);

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
