/**
 * calfnxt-web-host-gtk4 — floating GTK4 + webkitgtk-6.0 editor helper.
 *
 * Separate binary from the GTK3 XEmbed host. Same SPA/bridge contract over an
 * inherited Unix socket FD (newline JS, CNXV/CNXB viz, UI JSON). Top-level
 * GtkWindow — no GtkPlug / X11. Prefer Wayland (do not force GDK_BACKEND=x11).
 */

#include <gtk/gtk.h>
#include <webkit/webkit.h>
#include <jsc/jsc.h>
#include <glib-unix.h>

#include "web_host_shared.h"
#include "viz_bin.h"

#include <cerrno>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fcntl.h>
#include <string>
#include <unistd.h>
#include <vector>

namespace W = calfNXT::Ui::WebHostShared;

namespace {

struct HostState
{
  int sock = -1;
  std::string readBuf;
  char webRoot[4096] {};
  char entryHtml[256] {};
  int width = 360;
  int height = 420;
  GtkWidget* window = nullptr;
  WebKitWebView* webview = nullptr;
  WebKitWebContext* ctx = nullptr;
  GMainLoop* loop = nullptr;
  guint sockSource = 0;
};

HostState g;

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

void quitLoop()
{
  if (g.loop)
    g_main_loop_quit(g.loop);
}

/** Report window size to the plugin (floating stand-in for XEmbed socket). */
void reportWindowSize(const char* why)
{
  if (g.sock < 0)
    return;
  int w = g.width;
  int h = g.height;
  if (g.window)
  {
    const int aw = gtk_widget_get_width(g.window);
    const int ah = gtk_widget_get_height(g.window);
    if (aw >= 2 && ah >= 2)
    {
      w = aw;
      h = ah;
    }
  }
  if (w < 2 || h < 2)
    return;
  W::hostLog("[calfnxt-web-host-gtk4] socket %s %dx%d (want %dx%d)\n", why ? why : "?", w, h,
             g.width, g.height);
  char line[96];
  std::snprintf(line, sizeof line, "{\"t\":\"_socket\",\"w\":%d,\"h\":%d}\n", w, h);
  sendLine(line);
}

void applyWindowSize()
{
  if (!g.window || g.width < 1 || g.height < 1)
    return;
  gtk_window_set_default_size(GTK_WINDOW(g.window), g.width, g.height);
  gtk_widget_set_size_request(g.window, g.width, g.height);
  if (g.webview)
  {
    gtk_widget_set_hexpand(GTK_WIDGET(g.webview), TRUE);
    gtk_widget_set_vexpand(GTK_WIDGET(g.webview), TRUE);
  }
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
        W::logEvalJsError(error->message);
        g_error_free(error);
      }
      if (value)
        g_object_unref(value);
    },
    nullptr);
}

/** Inject viz payload — tiny JS body; samples as base64 + fmt/scale/bias. */
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
        webkit_web_view_call_async_javascript_function_finish(WEBKIT_WEB_VIEW(object), result,
                                                             &error);
      if (error)
      {
        W::logEvalJsError(error->message);
        g_error_free(error);
      }
      if (value)
        g_object_unref(value);
    },
    nullptr);
  g_variant_unref(args);
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
    W::appendVizPackItem(pack, fr);

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
        webkit_web_view_call_async_javascript_function_finish(WEBKIT_WEB_VIEW(object), result,
                                                             &error);
      if (error)
      {
        W::logEvalJsError(error->message);
        g_error_free(error);
      }
      if (value)
        g_object_unref(value);
    },
    nullptr);
  g_variant_unref(args);
}

void onFolderSelected(GObject* source, GAsyncResult* result, gpointer)
{
  GError* error = nullptr;
  GFile* file = gtk_file_dialog_select_folder_finish(GTK_FILE_DIALOG(source), result, &error);
  if (error)
  {
    if (!g_error_matches(error, GTK_DIALOG_ERROR, GTK_DIALOG_ERROR_DISMISSED)
        && !g_error_matches(error, G_IO_ERROR, G_IO_ERROR_CANCELLED))
      W::hostLog("[calfnxt-web-host-gtk4] folder dialog: %s\n", error->message);
    g_error_free(error);
    return;
  }
  if (!file)
    return;
  char* path = g_file_get_path(file);
  g_object_unref(file);
  if (!path || !path[0])
  {
    g_free(path);
    return;
  }
  std::string json = "{\"t\":\"_folder\",\"path\":\"";
  for (const char* p = path; *p; ++p)
  {
    if (*p == '\\' || *p == '"')
      json.push_back('\\');
    json.push_back(*p);
  }
  json += "\"}";
  sendLine(json.c_str());
  g_free(path);
}

void handlePluginLine(const std::string& line)
{
  if (line.empty())
    return;
  if (W::jsonHasType(line.c_str(), "_size"))
  {
    double w = 0.0;
    double h = 0.0;
    if (W::jsonNumberAfterKey(line.c_str(), "\"w\"", w)
        && W::jsonNumberAfterKey(line.c_str(), "\"h\"", h))
    {
      g.width = static_cast<int>(w);
      g.height = static_cast<int>(h);
      applyWindowSize();
    }
    return;
  }
  if (W::jsonHasType(line.c_str(), "_folder"))
  {
    GtkFileDialog* d = gtk_file_dialog_new();
    gtk_file_dialog_set_title(d, "IR Library");
    gtk_file_dialog_select_folder(d, g.window ? GTK_WINDOW(g.window) : nullptr, nullptr,
                                  onFolderSelected, nullptr);
    g_object_unref(d);
    return;
  }
  evalJs(line.c_str());
}

void onUriScheme(WebKitURISchemeRequest* request, gpointer)
{
  char full[4096];
  std::string rel;
  if (!W::resolveBundlePath(g.webRoot, webkit_uri_scheme_request_get_path(request), full,
                            sizeof full, &rel))
  {
    GError* err = g_error_new_literal(G_IO_ERROR, G_IO_ERROR_INVALID_ARGUMENT, "bad path");
    webkit_uri_scheme_request_finish_error(request, err);
    g_error_free(err);
    return;
  }

  GError* err = nullptr;
  GFile* file = g_file_new_for_path(full);
  GFileInputStream* stream = g_file_read(file, nullptr, &err);
  if (!stream)
  {
    W::hostLog("[calfnxt-web-host-gtk4] uri-scheme MISS %s (%s)\n", full,
               err && err->message ? err->message : "?");
    webkit_uri_scheme_request_finish_error(request, err);
    if (err)
      g_error_free(err);
    g_object_unref(file);
    return;
  }
  if (W::envFlag("CALFNXT_WEB_DEBUG"))
    W::hostLog("[calfnxt-web-host-gtk4] uri-scheme OK calfnxt://bundle/%s → %s\n", rel.c_str(),
               full);

  GFileInfo* info =
    g_file_query_info(file, G_FILE_ATTRIBUTE_STANDARD_SIZE, G_FILE_QUERY_INFO_NONE, nullptr,
                      nullptr);
  const goffset size = info ? g_file_info_get_size(info) : -1;
  if (info)
    g_object_unref(info);

  const char* mime = W::mimeForPath(full);
  auto* headers = soup_message_headers_new(SOUP_MESSAGE_HEADERS_RESPONSE);
  soup_message_headers_append(headers, "Access-Control-Allow-Origin", "*");
  auto* response = webkit_uri_scheme_response_new(G_INPUT_STREAM(stream), size);
  webkit_uri_scheme_response_set_status(response, 200, nullptr);
  webkit_uri_scheme_response_set_content_type(response, mime);
  webkit_uri_scheme_response_set_http_headers(response, headers);
  webkit_uri_scheme_request_finish_with_response(request, response);
  g_object_unref(response);
  g_object_unref(stream);
  g_object_unref(file);
}

/** webkitgtk-6.0: script-message-received delivers JSCValue* directly. */
void onScriptMessage(WebKitUserContentManager*, JSCValue* value, gpointer)
{
  if (!value)
    return;
  char* s = jsc_value_is_string(value) ? jsc_value_to_string(value) : jsc_value_to_json(value, 0);
  if (!s)
    return;
  // Mouse-friendly viz capture for studio (DAW hosts often eat Inspector Enter).
  static constexpr char kDumpPrefix[] = "DUMPVIZ\n";
  if (std::strncmp(s, kDumpPrefix, sizeof kDumpPrefix - 1) == 0)
  {
    const char* body = s + (sizeof kDumpPrefix - 1);
    const char* path = "/tmp/calfnxt-viz-dump.json";
    FILE* f = std::fopen(path, "wb");
    if (f)
    {
      const std::size_t n = std::strlen(body);
      const bool ok = std::fwrite(body, 1, n, f) == n;
      std::fclose(f);
      W::hostLog("[calfnxt-web-host-gtk4] viz dump %s (%zu bytes)%s\n", path, n,
                 ok ? "" : " — write incomplete");
    }
    else
      W::hostLog("[calfnxt-web-host-gtk4] viz dump failed: cannot open %s\n", path);
    g_free(s);
    return;
  }
  sendLine(s);
  g_free(s);
}

void onLoadChanged(WebKitWebView*, WebKitLoadEvent ev, gpointer)
{
  if (ev == WEBKIT_LOAD_STARTED)
  {
    if (W::envFlag("CALFNXT_WEB_DEBUG"))
      W::hostLog("[calfnxt-web-host-gtk4] load-started\n");
  }
  else if (ev == WEBKIT_LOAD_COMMITTED)
  {
    if (W::envFlag("CALFNXT_WEB_DEBUG"))
      W::hostLog("[calfnxt-web-host-gtk4] load-committed\n");
  }
  else if (ev == WEBKIT_LOAD_FINISHED)
  {
    W::hostLog("[calfnxt-web-host-gtk4] load-finished → _ready\n");
    reportWindowSize("load-finished");
    sendLine("{\"t\":\"_ready\"}");
  }
}

void onWebProcessTerminated(WebKitWebView*, WebKitWebProcessTerminationReason reason, gpointer)
{
  W::hostLog("[calfnxt-web-host-gtk4] web process terminated (reason=%d) — reloading\n",
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
    quitLoop();
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
      quitLoop();
      return G_SOURCE_REMOVE;
    }
    if (n == 0)
    {
      quitLoop();
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

gboolean onCloseRequest(GtkWindow*, gpointer)
{
  quitLoop();
  return TRUE;
}

} // namespace

int main(int argc, char** argv)
{
  W::CliArgs cli;
  const int cliRc = W::parseCli(argc, argv, cli, "calfnxt-web-host-gtk4");
  if (cliRc != 0)
    return cliRc == 1 ? 0 : cliRc;

  g.sock = cli.fd;
  std::snprintf(g.webRoot, sizeof g.webRoot, "%s", cli.webRoot);
  std::snprintf(g.entryHtml, sizeof g.entryHtml, "%s", cli.entryHtml);
  g.width = cli.width;
  g.height = cli.height;
  {
    const int flags = fcntl(g.sock, F_GETFL, 0);
    if (flags >= 0)
      fcntl(g.sock, F_SETFL, flags | O_NONBLOCK);
  }

  // Before GTK/WebKit: GBM/GL warnings must reach the file log.
  W::startStderrCapture();
  // Prefer Wayland — do not call gdk_set_allowed_backends("x11").
  gtk_init();

  W::hostLog("[calfnxt-web-host-gtk4] start parent=0x%lx root=%s entry=%s %dx%d\n",
             cli.parentXid, g.webRoot, g.entryHtml, g.width, g.height);
  W::hostLog("[calfnxt-web-host-gtk4] versions webkit=%u.%u.%u gtk=%u.%u.%u\n",
             webkit_get_major_version(), webkit_get_minor_version(), webkit_get_micro_version(),
             gtk_get_major_version(), gtk_get_minor_version(), gtk_get_micro_version());
  W::logGraphicsProbe("web-host-gtk4");

  // Non-ephemeral: Header prefs need HTML5 localStorage.
  // DOCUMENT_VIEWER: no browser-sized resource cache — local calfnxt:// SPA only.
  g.ctx = webkit_web_context_new();
  webkit_web_context_set_cache_model(g.ctx, WEBKIT_CACHE_MODEL_DOCUMENT_VIEWER);
  webkit_web_context_register_uri_scheme(g.ctx, "calfnxt", onUriScheme, nullptr, nullptr);
  auto* sec = webkit_web_context_get_security_manager(g.ctx);
  webkit_security_manager_register_uri_scheme_as_local(sec, "calfnxt");
  webkit_security_manager_register_uri_scheme_as_secure(sec, "calfnxt");
  webkit_security_manager_register_uri_scheme_as_cors_enabled(sec, "calfnxt");

  auto* ucm = webkit_user_content_manager_new();
  g_signal_connect(ucm, "script-message-received::calfnxt", G_CALLBACK(onScriptMessage), nullptr);
  webkit_user_content_manager_register_script_message_handler(ucm, "calfnxt", nullptr);

  const bool webDebug = W::envFlag("CALFNXT_WEB_DEBUG") || W::envFlag("CALFNXT_WEB_INSPECTOR");
  const std::string bridgeSrc = W::bridgeScriptSource(webDebug);
  auto* script = webkit_user_script_new(bridgeSrc.c_str(), WEBKIT_USER_CONTENT_INJECT_TOP_FRAME,
                                        WEBKIT_USER_SCRIPT_INJECT_AT_DOCUMENT_START, nullptr,
                                        nullptr);
  webkit_user_content_manager_add_script(ucm, script);
  webkit_user_script_unref(script);

  // Opaque page chrome even if SPA CSS loads late.
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
  const bool noGpu = W::envFlag("CALFNXT_WEB_NO_GPU");
  webkit_settings_set_hardware_acceleration_policy(
    settings, noGpu ? WEBKIT_HARDWARE_ACCELERATION_POLICY_NEVER
                    : WEBKIT_HARDWARE_ACCELERATION_POLICY_ALWAYS);

  // Trim unused browser subsystems; keep localStorage for Header prefs.
  webkit_settings_set_enable_page_cache(settings, FALSE);
  webkit_settings_set_enable_html5_database(settings, FALSE);
  webkit_settings_set_enable_media(settings, FALSE);
  webkit_settings_set_enable_media_stream(settings, FALSE);
  webkit_settings_set_enable_mediasource(settings, FALSE);
  webkit_settings_set_enable_encrypted_media(settings, FALSE);
  webkit_settings_set_enable_media_capabilities(settings, FALSE);
  webkit_settings_set_enable_webrtc(settings, FALSE);
  webkit_settings_set_enable_webaudio(settings, FALSE);
  webkit_settings_set_enable_html5_local_storage(settings, TRUE);

  webkit_settings_set_enable_developer_extras(settings, webDebug ? TRUE : FALSE);
  if (webDebug)
    webkit_settings_set_enable_write_console_messages_to_stdout(settings, TRUE);

  W::hostLog("[calfnxt-web-host-gtk4] build=gtk4-float-1 hw-accel=%s cache=document-viewer "
             "stderr-tee=%d\n",
             noGpu ? "never" : "always", W::stderrCaptureActive() ? 1 : 0);

  // Kill the white flash before WebKit paints the SPA.
  {
    auto* provider = gtk_css_provider_new();
    gtk_css_provider_load_from_string(provider,
                                      "window, webkitwebview, * {"
                                      "  background-color: #000000;"
                                      "  background-image: none;"
                                      "}");
    if (GdkDisplay* display = gdk_display_get_default())
    {
      gtk_style_context_add_provider_for_display(display, GTK_STYLE_PROVIDER(provider),
                                                 GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);
    }
    g_object_unref(provider);
  }

  {
    GdkRGBA bg {0.0, 0.0, 0.0, 1.0};
    webkit_web_view_set_background_color(g.webview, &bg);
  }

  g.window = gtk_window_new();
  gtk_window_set_title(GTK_WINDOW(g.window), "calfNXT");
  gtk_window_set_default_size(GTK_WINDOW(g.window), g.width, g.height);
  gtk_widget_set_size_request(g.window, g.width, g.height);
  gtk_window_set_child(GTK_WINDOW(g.window), GTK_WIDGET(g.webview));
  gtk_widget_set_hexpand(GTK_WIDGET(g.webview), TRUE);
  gtk_widget_set_vexpand(GTK_WIDGET(g.webview), TRUE);

  g_signal_connect(g.window, "close-request", G_CALLBACK(onCloseRequest), nullptr);
  g_signal_connect(g.webview, "load-changed", G_CALLBACK(onLoadChanged), nullptr);
  g_signal_connect(g.webview, "web-process-terminated", G_CALLBACK(onWebProcessTerminated),
                   nullptr);
  g_signal_connect(g.webview, "load-failed",
                   G_CALLBACK(+[](WebKitWebView*, WebKitLoadEvent, const gchar* failingUri,
                                  GError* error, gpointer) -> gboolean {
                     W::hostLog("[calfnxt-web-host-gtk4] load-failed: %s (%s)\n",
                                failingUri ? failingUri : "?",
                                error && error->message ? error->message : "?");
                     return FALSE;
                   }),
                   nullptr);

  char uri[512];
  std::snprintf(uri, sizeof uri, "calfnxt://bundle/%s", g.entryHtml);
  W::hostLog("[calfnxt-web-host-gtk4] load %s\n", uri);
  webkit_web_view_load_uri(g.webview, uri);

  gtk_window_present(GTK_WINDOW(g.window));

  if (W::envFlag("CALFNXT_WEB_INSPECTOR"))
  {
    auto* inspector = webkit_web_view_get_inspector(g.webview);
    webkit_web_inspector_show(inspector);
  }

  g.sockSource = g_unix_fd_add(g.sock, static_cast<GIOCondition>(G_IO_IN | G_IO_ERR | G_IO_HUP),
                               onSocketReadable, nullptr);

  g.loop = g_main_loop_new(nullptr, FALSE);
  g_main_loop_run(g.loop);

  if (g.sockSource)
  {
    g_source_remove(g.sockSource);
    g.sockSource = 0;
  }
  if (g.loop)
  {
    g_main_loop_unref(g.loop);
    g.loop = nullptr;
  }
  if (g.window)
  {
    gtk_window_destroy(GTK_WINDOW(g.window));
    g.window = nullptr;
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
