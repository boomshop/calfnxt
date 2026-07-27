#include "web_editor.h"

#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/vstspeaker.h"

#include <gdk/gdkx.h>
#include <gtk/gtkx.h>
#include <jsc/jsc.h>

#include <algorithm>
#include <cstdarg>
#include <charconv>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <dlfcn.h>
#include <string>

namespace calfNXT {
namespace Ui {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {

bool g_gtkReady = false;

void dlAnchor() {}

struct SuppressParamPush
{
  bool& flag;
  explicit SuppressParamPush(bool& f) : flag(f) { flag = true; }
  ~SuppressParamPush() { flag = false; }
};

void fillWebRoot(char* out, size_t cap)
{
  Dl_info info {};
  if (dladdr(reinterpret_cast<void*>(&dlAnchor), &info) && info.dli_fname)
  {
    std::string so(info.dli_fname);
    auto pos = so.rfind("/x86_64-linux/");
    if (pos != std::string::npos)
    {
      std::snprintf(out, cap, "%s/Resources", so.substr(0, pos).c_str());
      return;
    }
    auto slash = so.rfind('/');
    if (slash != std::string::npos)
    {
      std::snprintf(out, cap, "%s/../Resources", so.substr(0, slash).c_str());
      return;
    }
  }
  std::snprintf(out, cap, ".");
}

bool jsonHasType(const char* s, const char* type)
{
  char needle[32];
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

bool envFlag(const char* name)
{
  return g_getenv(name) != nullptr;
}

/** Optional override: CALFNXT_UI_SCALE=1.35 (or 1 to force no scaling). */
float envFloat(const char* name)
{
  const char* s = g_getenv(name);
  if (!s || !s[0])
    return 0.f;
  char* end = nullptr;
  const float v = std::strtof(s, &end);
  if (end == s || !(v > 0.05f && v < 8.f))
    return 0.f;
  return v;
}

int clampPx(int v, int lo, int hi)
{
  return std::max(lo, std::min(hi, v));
}

/** stderr when CALFNXT_WEB_DEBUG is set (Carla often hides plugin stderr). */
void logMsg(const char* fmt, ...)
{
  if (!envFlag("CALFNXT_WEB_DEBUG"))
    return;
  char buf[512];
  va_list ap;
  va_start(ap, fmt);
  std::vsnprintf(buf, sizeof buf, fmt, ap);
  va_end(ap);
  std::fputs(buf, stderr);
  std::fflush(stderr);
}

} // namespace

void WebEditor::syncNativeSize()
{
  if (!plug_)
    return;
  const int w = rect.getWidth();
  const int h = rect.getHeight();
  if (w < 1 || h < 1)
    return;

  gtk_widget_set_size_request(plug_, w, h);
  if (webview_)
  {
    webkit_web_view_set_zoom_level(webview_, 1.0);
    gtk_widget_set_hexpand(GTK_WIDGET(webview_), TRUE);
    gtk_widget_set_vexpand(GTK_WIDGET(webview_), TRUE);
    gtk_widget_set_size_request(GTK_WIDGET(webview_), w, h);
  }
  if (GdkWindow* win = gtk_widget_get_window(plug_))
    gdk_window_resize(win, w, h);
  gtk_widget_queue_resize(plug_);
}

void WebEditor::requestHostSize()
{
  if (!plugFrame || requestingHostResize_)
    return;
  requestingHostResize_ = true;
  ViewRect wanted = rect;
  const tresult r = plugFrame->resizeView(this, &wanted);
  logMsg("[calfnxt] resizeView %dx%d (host result=%d)\n",
         wanted.getWidth(), wanted.getHeight(), static_cast<int>(r));
  requestingHostResize_ = false;
  syncNativeSize();
}

bool WebEditor::applyDesignScale(double scale, const char* reason)
{
  if (viewportApplied_)
  {
    logMsg("[calfnxt] scale ignored (already applied)\n");
    return true;
  }
  if (!(scale > 0.05 && scale < 8.0))
    scale = 1.0;

  viewportApplied_ = true;

  logMsg("[calfnxt] scale=%.3f via %s (design %dx%d)\n", scale,
         reason ? reason : "?", designWidth_, designHeight_);

  if (scale < 1.02)
  {
    logMsg("[calfnxt] scale≈1, no resize\n");
    return true;
  }

  const int newW = clampPx(static_cast<int>(std::lround(designWidth_ * scale)), 160, 8192);
  const int newH = clampPx(static_cast<int>(std::lround(designHeight_ * scale)), 120, 8192);
  rect = ViewRect(0, 0, newW, newH);
  requestHostSize();
  return true;
}

bool WebEditor::applyCssViewport(int cssW, int cssH)
{
  if (viewportApplied_)
  {
    logMsg("[calfnxt] viewport ignored (already applied)\n");
    return true;
  }
  if (cssW < 1 || cssH < 1)
    return false;

  // Manual override wins over measurement (exotic display servers, etc.).
  if (const float envScale = envFloat("CALFNXT_UI_SCALE"))
    return applyDesignScale(envScale, "CALFNXT_UI_SCALE");

  // Prefer live widget allocation when available (true embed pixels).
  int hostW = rect.getWidth();
  int hostH = rect.getHeight();
  if (plug_ && gtk_widget_get_realized(plug_))
  {
    GtkAllocation alloc {};
    gtk_widget_get_allocation(plug_, &alloc);
    if (alloc.width > 1 && alloc.height > 1)
    {
      hostW = alloc.width;
      hostH = alloc.height;
    }
  }

  const double scaleW = static_cast<double>(hostW) / static_cast<double>(cssW);
  const double scaleH = static_cast<double>(hostH) / static_cast<double>(cssH);
  double scale = 0.5 * (scaleW + scaleH);
  if (!(scale > 0.05 && scale < 8.0))
    scale = 1.0;

  logMsg("[calfnxt] viewport: host %dx%d / css %dx%d → scale=%.3f (design %dx%d)\n",
         hostW, hostH, cssW, cssH, scale, designWidth_, designHeight_);

  return applyDesignScale(scale, "viewport");
}

WebEditor::WebEditor(EditController* controller, ViewRect size, const char* entryHtml)
: CPluginView(nullptr)
, controller_(controller)
{
  designWidth_ = std::max<int32>(1, size.getWidth());
  designHeight_ = std::max<int32>(1, size.getHeight());
  // Open at design size; CSS viewport report may request a scaled host size later.
  rect = ViewRect(0, 0, designWidth_, designHeight_);
  std::snprintf(entryHtml_, sizeof entryHtml_, "%s", entryHtml ? entryHtml : "index.html");
}

WebEditor::~WebEditor()
{
  detachParamListeners();
  closeWeb();
}

void WebEditor::ensureGtk()
{
  if (g_gtkReady)
    return;
  gdk_set_allowed_backends("x11");
  g_gtkReady = gtk_init_check(nullptr, nullptr) == TRUE;
}

tresult PLUGIN_API WebEditor::isPlatformTypeSupported(FIDString type)
{
  if (type && std::strcmp(type, kPlatformTypeX11EmbedWindowID) == 0)
    return kResultTrue;
  return kResultFalse;
}

void WebEditor::onUriScheme(WebKitURISchemeRequest* request, gpointer userData)
{
  auto* self = static_cast<WebEditor*>(userData);
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
  // Hash routes are client-side only.
  if (const auto hash = rel.find('#'); hash != std::string::npos)
    rel.resize(hash);
  if (rel.empty())
    rel = "index.html";

  char full[4096];
  std::snprintf(full, sizeof full, "%s/%s", self->webRoot_, rel.c_str());

  GError* err = nullptr;
  GFile* file = g_file_new_for_path(full);
  GFileInputStream* stream = g_file_read(file, nullptr, &err);
  if (!stream)
  {
    webkit_uri_scheme_request_finish_error(request, err);
    if (err)
      g_error_free(err);
    g_object_unref(file);
    return;
  }
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

void WebEditor::onScriptMessage(WebKitUserContentManager*, WebKitJavascriptResult* js, gpointer userData)
{
  auto* self = static_cast<WebEditor*>(userData);
  JSCValue* value = webkit_javascript_result_get_js_value(js);
  if (!value)
    return;

  char* s = jsc_value_is_string(value) ? jsc_value_to_string(value) : jsc_value_to_json(value, 0);
  if (!s)
    return;
  self->onWebMessage(s);
  g_free(s);
}

bool WebEditor::openWeb(void* x11Parent)
{
  ensureGtk();
  if (!g_gtkReady || !x11Parent)
    return false;

  fillWebRoot(webRoot_, sizeof webRoot_);

  ctx_ = webkit_web_context_new();
  webkit_web_context_register_uri_scheme(ctx_, "calfnxt", onUriScheme, this, nullptr);
  auto* sec = webkit_web_context_get_security_manager(ctx_);
  webkit_security_manager_register_uri_scheme_as_local(sec, "calfnxt");
  webkit_security_manager_register_uri_scheme_as_secure(sec, "calfnxt");
  webkit_security_manager_register_uri_scheme_as_cors_enabled(sec, "calfnxt");

  auto* ucm = webkit_user_content_manager_new();
  g_signal_connect(ucm, "script-message-received::calfnxt", G_CALLBACK(onScriptMessage), this);
  webkit_user_content_manager_register_script_message_handler(ucm, "calfnxt");

  // UI→host: set uses fixed-point q/d; viewport is integer CSS w/h.
  static const char bridge[] =
    "window.__calfnxtHostQ=window.__calfnxtHostQ||[];"
    "window.__calfnxtOnHost=window.__calfnxtOnHost||function(m){window.__calfnxtHostQ.push(m);};"
    "window.calfnxtNative={post:function(m){"
    "var src=typeof m==='string'?JSON.parse(m):m;"
    "var o={t:src.t};"
    "if(src.id!=null)o.id=src.id|0;"
    "if(src.t==='set'&&typeof src.v==='number'){o.q=Math.round(src.v*1e6);o.d=1e6;}"
    "if(src.t==='viewport'){"
    "if(src.w!=null)o.w=src.w|0;if(src.h!=null)o.h=src.h|0;"
    "}"
    "window.webkit.messageHandlers.calfnxt.postMessage(JSON.stringify(o));}};"
    ;
  auto* script = webkit_user_script_new(bridge, WEBKIT_USER_CONTENT_INJECT_TOP_FRAME,
                                        WEBKIT_USER_SCRIPT_INJECT_AT_DOCUMENT_START, nullptr, nullptr);
  webkit_user_content_manager_add_script(ucm, script);
  webkit_user_script_unref(script);

  webview_ = WEBKIT_WEB_VIEW(g_object_new(WEBKIT_TYPE_WEB_VIEW, "web-context", ctx_,
                                          "user-content-manager", ucm, nullptr));
  g_object_unref(ucm);

  auto* settings = webkit_web_view_get_settings(webview_);
  // Software rendering is more stable for AUX canvas meters in X11 embeds.
  webkit_settings_set_hardware_acceleration_policy(
    settings, WEBKIT_HARDWARE_ACCELERATION_POLICY_NEVER);
  const bool webDebug = envFlag("CALFNXT_WEB_DEBUG") || envFlag("CALFNXT_WEB_INSPECTOR");
  webkit_settings_set_enable_developer_extras(settings, webDebug ? TRUE : FALSE);
  if (webDebug)
    webkit_settings_set_enable_write_console_messages_to_stdout(settings, TRUE);

  const auto parent = static_cast<Window>(reinterpret_cast<uintptr_t>(x11Parent));
  plug_ = gtk_plug_new(parent);
  gtk_widget_set_size_request(plug_, rect.getWidth(), rect.getHeight());
  gtk_container_add(GTK_CONTAINER(plug_), GTK_WIDGET(webview_));
  gtk_widget_set_hexpand(GTK_WIDGET(webview_), TRUE);
  gtk_widget_set_vexpand(GTK_WIDGET(webview_), TRUE);
  gtk_widget_show_all(plug_);
  syncNativeSize();

  g_signal_connect(webview_, "load-changed", G_CALLBACK(onLoadChanged), this);
  g_signal_connect(webview_, "web-process-terminated",
                   G_CALLBACK(onWebProcessTerminatedCb), this);
  g_signal_connect(webview_, "load-failed",
                   G_CALLBACK(+[](WebKitWebView*, WebKitLoadEvent, const gchar* failingUri,
                                  GError* error, gpointer) -> gboolean {
                     std::fprintf(stderr, "[calfnxt] load-failed: %s (%s)\n",
                                  failingUri ? failingUri : "?",
                                  error && error->message ? error->message : "?");
                     return FALSE;
                   }),
                   nullptr);

  char uri[512];
  std::snprintf(uri, sizeof uri, "calfnxt://bundle/%s", entryHtml_);
  webkit_web_view_load_uri(webview_, uri);

  if (envFlag("CALFNXT_WEB_INSPECTOR"))
  {
    auto* inspector = webkit_web_view_get_inspector(webview_);
    webkit_web_inspector_show(inspector);
  }
  return true;
}

void WebEditor::onLoadChanged(WebKitWebView*, WebKitLoadEvent ev, gpointer userData)
{
  if (ev == WEBKIT_LOAD_FINISHED)
    static_cast<WebEditor*>(userData)->onPageReady();
}

void WebEditor::onWebProcessTerminatedCb(WebKitWebView*, WebKitWebProcessTerminationReason reason,
                                         gpointer userData)
{
  static_cast<WebEditor*>(userData)->onWebProcessTerminated(reason);
}

void WebEditor::onWebProcessTerminated(WebKitWebProcessTerminationReason reason)
{
  std::fprintf(stderr,
               "[calfnxt] web process terminated (reason=%d) — reloading editor\n",
               static_cast<int>(reason));
  // Reset flush bookkeeping so a fresh page gets a full param/viz sync.
  for (std::uint32_t i = 0; i < kMaxQueuedParams; ++i)
    lastFlushedValid_[i] = false;
  lastVizFlush_ = {};
  pendingParamMask_.store(0, std::memory_order_relaxed);

  if (!webview_)
    return;
  char uri[512];
  std::snprintf(uri, sizeof uri, "calfnxt://bundle/%s", entryHtml_);
  webkit_web_view_load_uri(webview_, uri);
}

void WebEditor::closeWeb()
{
  if (timerRegistered_ && runLoop_)
  {
    runLoop_->unregisterTimer(this);
    timerRegistered_ = false;
  }
  runLoop_ = nullptr;

  if (plug_)
  {
    gtk_widget_destroy(plug_);
    plug_ = nullptr;
    webview_ = nullptr;
  }
  if (ctx_)
  {
    g_object_unref(ctx_);
    ctx_ = nullptr;
  }
}

tresult PLUGIN_API WebEditor::attached(void* parent, FIDString type)
{
  if (isPlatformTypeSupported(type) != kResultTrue)
    return kResultFalse;

  viewportApplied_ = false;
  rect = ViewRect(0, 0, designWidth_, designHeight_);

  if (!openWeb(parent))
    return kResultFalse;

  if (plugFrame)
  {
    Linux::IRunLoop* rl = nullptr;
    if (plugFrame->queryInterface(Linux::IRunLoop::iid, (void**)&rl) == kResultOk && rl)
    {
      runLoop_ = rl;
      rl->release();
      if (runLoop_->registerTimer(this, 16) == kResultOk)
        timerRegistered_ = true;
    }
    requestHostSize();
    // Env override can apply immediately (no need to wait for UI viewport).
    if (const float envScale = envFloat("CALFNXT_UI_SCALE"))
      applyDesignScale(envScale, "CALFNXT_UI_SCALE");
  }
  return CPluginView::attached(parent, type);
}

tresult PLUGIN_API WebEditor::removed()
{
  detachParamListeners();
  closeWeb();
  return CPluginView::removed();
}

tresult PLUGIN_API WebEditor::canResize()
{
  return kResultTrue;
}

tresult PLUGIN_API WebEditor::checkSizeConstraint(ViewRect* r)
{
  if (!r)
    return kResultFalse;
  constexpr int32 minW = 320;
  constexpr int32 minH = 240;
  int32 w = r->getWidth();
  int32 h = r->getHeight();
  if (w < minW)
    w = minW;
  if (h < minH)
    h = minH;
  r->right = r->left + w;
  r->bottom = r->top + h;
  return kResultTrue;
}

tresult PLUGIN_API WebEditor::onSize(ViewRect* newSize)
{
  if (newSize)
  {
    ViewRect constrained = *newSize;
    checkSizeConstraint(&constrained);
    rect = constrained;
  }
  syncNativeSize();
  return kResultTrue;
}

void PLUGIN_API WebEditor::onTimer()
{
  while (gtk_events_pending())
    gtk_main_iteration_do(FALSE);
  pollParamsFromController();
  flushPendingParams();
  flushViz();
}

void WebEditor::evalJs(const char* js)
{
  if (!webview_ || !js)
    return;
  webkit_web_view_evaluate_javascript(
    webview_, js, -1, nullptr, nullptr, nullptr,
    +[](GObject* object, GAsyncResult* result, gpointer) {
      GError* error = nullptr;
      JSCValue* value =
        webkit_web_view_evaluate_javascript_finish(WEBKIT_WEB_VIEW(object), result, &error);
      if (error)
      {
        std::fprintf(stderr, "[calfnxt] evalJs: %s\n", error->message);
        g_error_free(error);
      }
      if (value)
        g_object_unref(value);
    },
    nullptr);
}

void WebEditor::pushParamPlain(ParamID id, double plain)
{
  if (!webview_ || id >= kMaxQueuedParams)
    return;
  pendingParamPlain_[id].store(plain, std::memory_order_relaxed);
  pendingParamMask_.fetch_or(1u << id, std::memory_order_acq_rel);
}

void WebEditor::pollParamsFromController()
{
  if (suppressParamPush_ || !controller_ || !webview_)
    return;
  const int32 n = controller_->getParameterCount();
  for (int32 i = 0; i < n; ++i)
  {
    ParameterInfo info {};
    if (controller_->getParameterInfo(i, info) != kResultOk)
      continue;
    if (info.id >= kMaxQueuedParams)
      continue;
    auto* p = controller_->getParameterObject(info.id);
    if (!p)
      continue;
    const double plain = p->toPlain(p->getNormalized());
    if (lastFlushedValid_[info.id]
        && std::abs(lastFlushedPlain_[info.id] - plain) <= 1e-12)
      continue;
    pushParamPlain(info.id, plain);
  }
}

void WebEditor::flushPendingParams()
{
  std::uint32_t mask = pendingParamMask_.exchange(0, std::memory_order_acq_rel);
  while (mask != 0)
  {
    const unsigned id = static_cast<unsigned>(__builtin_ctz(mask));
    mask &= mask - 1u;
    if (id >= kMaxQueuedParams)
      continue;
    const double plain = pendingParamPlain_[id].load(std::memory_order_relaxed);
    // Locale-safe via to_chars (never snprintf %.g under de_DE).
    char num[64];
    const auto [endp, ec] = std::to_chars(num, num + sizeof num, plain,
                                          std::chars_format::general, 17);
    if (ec != std::errc())
      continue;
    *endp = '\0';
    lastFlushedPlain_[id] = plain;
    lastFlushedValid_[id] = true;
    char js[256];
    std::snprintf(js, sizeof js,
                  "window.__calfnxtOnHost && window.__calfnxtOnHost({t:\"param\",id:%u,v:%s});",
                  id, num);
    evalJs(js);
  }
}

void WebEditor::flushVizLevels(const char* streamId, float* levels, int n)
{
  flushVizArray(streamId, "levels", levels, n);
}

void WebEditor::flushVizArray(const char* streamId, const char* kind, float* values, int n)
{
  if (!webview_ || !streamId || !kind || n <= 0)
    return;

  // try/catch so a UI exception cannot tear down the WebKit process.
  char js[1536];
  char* p = js;
  char* end = js + sizeof js;
  int written = std::snprintf(p, static_cast<size_t>(end - p),
                              "try{window.__calfnxtOnHost&&window.__calfnxtOnHost({t:\"viz\",id:\"%s\",kind:\"%s\",v:[",
                              streamId, kind);
  if (written < 0 || p + written >= end)
    return;
  p += written;

  for (int i = 0; i < n; ++i)
  {
    char num[64];
    const auto [endp, ec] = std::to_chars(num, num + sizeof num, static_cast<double>(values[i]),
                                          std::chars_format::general, 9);
    if (ec != std::errc())
      return;
    *endp = '\0';
    written = std::snprintf(p, static_cast<size_t>(end - p), "%s%s", i ? "," : "", num);
    if (written < 0 || p + written >= end)
      return;
    p += written;
  }
  written = std::snprintf(p, static_cast<size_t>(end - p), "]});}catch(e){}");
  if (written < 0 || p + written >= end)
    return;
  evalJs(js);
}

void WebEditor::flushViz()
{
  if (!vizSource_ || !webview_)
    return;

  using clock = std::chrono::steady_clock;
  const auto now = clock::now();
  if (lastVizFlush_.time_since_epoch().count() != 0)
  {
    const auto minGap = std::chrono::milliseconds(1000 / kVizHz);
    if (now - lastVizFlush_ < minGap)
      return;
  }
  lastVizFlush_ = now;

  constexpr int kMaxCh = 8;
  constexpr float kMinDb = -96.f;
  constexpr float kMaxDb = 12.f;
  auto clampLevels = [](float* levels, int n) {
    for (int i = 0; i < n; ++i)
    {
      float v = levels[i];
      if (!std::isfinite(v))
        v = kMinDb;
      else if (v < kMinDb)
        v = kMinDb;
      else if (v > kMaxDb)
        v = kMaxDb;
      levels[i] = v;
    }
  };

  float inLevels[kMaxCh];
  const int nIn = vizSource_->takeInputLevelsDb(inLevels, kMaxCh);
  if (nIn > 0)
  {
    clampLevels(inLevels, nIn);
    flushVizLevels(vizSource_->vizInputLevelsId(), inLevels, nIn);
  }

  float outLevels[kMaxCh];
  const int nOut = vizSource_->takeOutputLevelsDb(outLevels, kMaxCh);
  if (nOut > 0)
  {
    clampLevels(outLevels, nOut);
    flushVizLevels(vizSource_->vizOutputLevelsId(), outLevels, nOut);
  }

  constexpr int kMaxBands = 32;
  constexpr float kGainMin = -24.f;
  constexpr float kGainMax = 24.f;
  float bandGains[kMaxBands];
  const int nGains = vizSource_->takeBandGainsDb(bandGains, kMaxBands);
  if (nGains > 0)
  {
    for (int i = 0; i < nGains; ++i)
    {
      float v = bandGains[i];
      if (!std::isfinite(v))
        v = 0.f;
      else if (v < kGainMin)
        v = kGainMin;
      else if (v > kGainMax)
        v = kGainMax;
      bandGains[i] = v;
    }
    flushVizArray(vizSource_->vizBandGainsId(), "gains", bandGains, nGains);
  }
}

void WebEditor::pushAllParams()
{
  if (!controller_)
    return;
  const int32 n = controller_->getParameterCount();
  for (int32 i = 0; i < n; ++i)
  {
    ParameterInfo info {};
    if (controller_->getParameterInfo(i, info) != kResultOk)
      continue;
    if (auto* p = controller_->getParameterObject(info.id))
      pushParamPlain(info.id, p->toPlain(p->getNormalized()));
  }
}

void WebEditor::attachParamListeners()
{
  if (listeningParams_ || !controller_)
    return;
  const int32 n = controller_->getParameterCount();
  for (int32 i = 0; i < n; ++i)
  {
    ParameterInfo info {};
    if (controller_->getParameterInfo(i, info) != kResultOk)
      continue;
    if (auto* p = controller_->getParameterObject(info.id))
      p->addDependent(this);
  }
  listeningParams_ = true;
}

void WebEditor::detachParamListeners()
{
  if (!listeningParams_ || !controller_)
    return;
  const int32 n = controller_->getParameterCount();
  for (int32 i = 0; i < n; ++i)
  {
    ParameterInfo info {};
    if (controller_->getParameterInfo(i, info) != kResultOk)
      continue;
    if (auto* p = controller_->getParameterObject(info.id))
      p->removeDependent(this);
  }
  listeningParams_ = false;
}

void PLUGIN_API WebEditor::update(FUnknown* changedUnknown, int32 message)
{
  if (suppressParamPush_ || message != IDependent::kChanged || !changedUnknown)
    return;
  auto* param = FCast<Parameter>(changedUnknown);
  if (!param)
    return;
  pushParamPlain(param->getInfo().id, param->toPlain(param->getNormalized()));
}

int WebEditor::queryIoChannelCount() const
{
  constexpr int kDefault = 2;
  constexpr int kMax = 8;
  if (!controller_)
    return kDefault;

  IAudioProcessor* proc = nullptr;
  if (controller_->queryInterface(IAudioProcessor::iid, (void**)&proc) != kResultOk || !proc)
    return kDefault;

  SpeakerArrangement arr = 0;
  const tresult r = proc->getBusArrangement(kOutput, 0, arr);
  proc->release();
  if (r != kResultOk)
    return kDefault;

  const int ch = SpeakerArr::getChannelCount(arr);
  if (ch < 1)
    return kDefault;
  return ch > kMax ? kMax : ch;
}

void WebEditor::pushIoChannels()
{
  if (!webview_)
    return;
  const int ch = queryIoChannelCount();
  char js[128];
  std::snprintf(js, sizeof js,
                "window.__calfnxtOnHost && window.__calfnxtOnHost({t:\"io\",ch:%d});", ch);
  evalJs(js);
}

void WebEditor::onPageReady()
{
  logMsg("[calfnxt] page ready (design %dx%d, rect %dx%d)\n", designWidth_, designHeight_,
         rect.getWidth(), rect.getHeight());
  attachParamListeners();
  pushAllParams();
  pushIoChannels();
  flushPendingParams();
}

bool WebEditor::onWebMessage(const char* json)
{
  if (!json)
    return false;

  if (jsonHasType(json, "viewport"))
  {
    double w = 0.0;
    double h = 0.0;
    if (!jsonNumberAfterKey(json, "\"w\"", w) || !jsonNumberAfterKey(json, "\"h\"", h))
    {
      logMsg("[calfnxt] viewport message missing w/h: %s\n", json);
      return false;
    }
    logMsg("[calfnxt] viewport message received: css %.0fx%.0f\n", w, h);
    return applyCssViewport(static_cast<int>(std::lround(w)), static_cast<int>(std::lround(h)));
  }

  if (!controller_)
    return false;

  if (jsonHasType(json, "sync"))
  {
    pushAllParams();
    pushIoChannels();
    return true;
  }

  double idf = 0.0;
  const ParamID id = jsonNumberAfterKey(json, "\"id\"", idf) ? static_cast<ParamID>(idf) : 0;

  if (jsonHasType(json, "begin"))
  {
    controller_->beginEdit(id);
    return true;
  }
  if (jsonHasType(json, "end"))
  {
    controller_->endEdit(id);
    return true;
  }
  if (jsonHasType(json, "set"))
  {
    double plain = 0.0;
    double q = 0.0;
    double d = 0.0;
    const bool haveFixed = jsonNumberAfterKey(json, "\"q\"", q)
                           && jsonNumberAfterKey(json, "\"d\"", d) && d != 0.0;
    if (haveFixed)
      plain = q / d;
    else if (!jsonNumberAfterKey(json, "\"v\"", plain))
      return false;

    if (auto* p = controller_->getParameterObject(id))
    {
      const ParamValue n = p->toNormalized(plain);
      // Suppress echo while hosts may call setParamNormalized inside performEdit.
      {
        SuppressParamPush guard(suppressParamPush_);
        controller_->setParamNormalized(id, n);
        controller_->performEdit(id, n);
      }
      if (id < kMaxQueuedParams)
      {
        lastFlushedPlain_[id] = plain;
        lastFlushedValid_[id] = true;
      }
    }
    return true;
  }
  return false;
}

} // namespace Ui
} // namespace calfNXT
