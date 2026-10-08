#include "web_host_shared.h"

#include <algorithm>
#include <cerrno>
#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <dirent.h>
#include <fcntl.h>
#include <unistd.h>

namespace calfNXT {
namespace Ui {
namespace WebHostShared {
namespace {

struct StderrCapture
{
  int saved = -1;
  int readFd = -1;
  GThread* thread = nullptr;
  bool gbmNoted = false;
};

StderrCapture stderrCap;

void writeSavedStderr(const char* data, size_t n)
{
  const int fd = stderrCap.saved >= 0 ? stderrCap.saved : STDERR_FILENO;
  size_t off = 0;
  while (off < n)
  {
    const ssize_t w = ::write(fd, data + off, n - off);
    if (w < 0)
    {
      if (errno == EINTR)
        continue;
      break;
    }
    if (w == 0)
      break;
    off += static_cast<size_t>(w);
  }
}

void noteCapturedLine(const std::string& line)
{
  writeSavedStderr(line.data(), line.size());
  if (line.size() <= 1024)
    appendUiLog(line.c_str());
  else
  {
    std::string cut = line.substr(0, 1000);
    cut += "...\n";
    appendUiLog(cut.c_str());
  }
  if (stderrCap.gbmNoted || line.find("Failed to create GBM buffer") == std::string::npos)
    return;
  stderrCap.gbmNoted = true;
  static const char hint[] =
    "[calfnxt-web-host] gbm-fail: DMA-BUF renderer failed to allocate a GBM buffer; "
    "the page can finish loading while the surface stays black. "
    "Try WEBKIT_DISABLE_DMABUF_RENDERER=1, or CALFNXT_WEB_HOST=gtk4 (floating GTK4). "
    "CALFNXT_WEB_NO_GPU=1 is the slower software fallback.\n";
  writeSavedStderr(hint, sizeof hint - 1);
  appendUiLog(hint);
}

gpointer stderrCaptureThread(gpointer)
{
  std::string acc;
  char tmp[1024];
  while (stderrCap.readFd >= 0)
  {
    const ssize_t n = ::read(stderrCap.readFd, tmp, sizeof tmp);
    if (n == 0)
      break;
    if (n < 0)
    {
      if (errno == EINTR)
        continue;
      break;
    }
    acc.append(tmp, static_cast<size_t>(n));
    for (;;)
    {
      auto pos = acc.find('\n');
      if (pos == std::string::npos)
      {
        if (acc.size() < 8192)
          break;
        acc.push_back('\n');
        pos = acc.size() - 1;
      }
      std::string line = acc.substr(0, pos + 1);
      acc.erase(0, pos + 1);
      noteCapturedLine(line);
    }
  }
  return nullptr;
}

bool readFirstLine(const char* path, char* out, size_t outLen)
{
  if (!out || outLen < 2)
    return false;
  out[0] = '\0';
  const int fd = ::open(path, O_RDONLY | O_CLOEXEC);
  if (fd < 0)
    return false;
  const ssize_t n = ::read(fd, out, outLen - 1);
  ::close(fd);
  if (n <= 0)
  {
    out[0] = '\0';
    return false;
  }
  out[n] = '\0';
  for (size_t i = 0; i < static_cast<size_t>(n); ++i)
  {
    if (out[i] == '\n' || out[i] == '\r')
    {
      out[i] = '\0';
      break;
    }
  }
  size_t len = std::strlen(out);
  while (len > 0 && (out[len - 1] == ' ' || out[len - 1] == '\t'))
    out[--len] = '\0';
  return out[0] != '\0';
}

} // namespace

bool envFlag(const char* name)
{
  const char* s = std::getenv(name);
  return s != nullptr && s[0] != '\0';
}

const char* envOrUnset(const char* name)
{
  const char* s = std::getenv(name);
  return (s && s[0]) ? s : "(unset)";
}

void startStderrCapture()
{
  int fds[2] = {-1, -1};
  if (::pipe2(fds, O_CLOEXEC) != 0)
    return;
  const int saved = ::dup(STDERR_FILENO);
  if (saved < 0)
  {
    ::close(fds[0]);
    ::close(fds[1]);
    return;
  }
  ::fcntl(saved, F_SETFD, FD_CLOEXEC);
  if (::dup2(fds[1], STDERR_FILENO) < 0)
  {
    ::close(saved);
    ::close(fds[0]);
    ::close(fds[1]);
    return;
  }
  ::close(fds[1]);
  stderrCap.saved = saved;
  stderrCap.readFd = fds[0];
  stderrCap.thread = g_thread_new("calfnxt-stderr", stderrCaptureThread, nullptr);
  if (!stderrCap.thread)
  {
    ::dup2(saved, STDERR_FILENO);
    ::close(saved);
    ::close(fds[0]);
    stderrCap.saved = -1;
    stderrCap.readFd = -1;
  }
}

bool stderrCaptureActive()
{
  return stderrCap.saved >= 0;
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
  const size_t len = static_cast<size_t>(n) >= sizeof buf ? sizeof buf - 1 : static_cast<size_t>(n);
  writeSavedStderr(buf, len);
  appendUiLog(buf);
}

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

void logGraphicsProbe(const char* tag)
{
  const char* t = tag && tag[0] ? tag : "web-host";
  hostLog("[calfnxt-%s] gfx session=%s wayland=%s gdk_backend=%s DISPLAY=%s stderr-tee=%d\n", t,
          envOrUnset("XDG_SESSION_TYPE"), envOrUnset("WAYLAND_DISPLAY"), envOrUnset("GDK_BACKEND"),
          envOrUnset("DISPLAY"), stderrCap.saved >= 0 ? 1 : 0);
  hostLog("[calfnxt-%s] gfx dmabuf=%s compositing=%s no_gpu=%s glx_vendor=%s\n", t,
          envOrUnset("WEBKIT_DISABLE_DMABUF_RENDERER"),
          envOrUnset("WEBKIT_DISABLE_COMPOSITING_MODE"), envOrUnset("CALFNXT_WEB_NO_GPU"),
          envOrUnset("__GLX_VENDOR_LIBRARY_NAME"));

  DIR* dir = ::opendir("/sys/class/drm");
  int found = 0;
  if (!dir)
  {
    hostLog("[calfnxt-%s] gfx drm=(unreadable)\n", t);
  }
  else
  {
    while (dirent* ent = ::readdir(dir))
    {
      const char* name = ent->d_name;
      if (std::strncmp(name, "card", 4) != 0 || std::strchr(name, '-') || name[4] == '\0')
        continue;
      bool digits = true;
      for (const char* p = name + 4; *p; ++p)
      {
        if (*p < '0' || *p > '9')
          digits = false;
      }
      if (!digits)
        continue;

      char path[512];
      std::snprintf(path, sizeof path, "/sys/class/drm/%s/device/driver", name);
      char link[512];
      const char* driver = "?";
      const ssize_t n = ::readlink(path, link, sizeof link - 1);
      if (n > 0)
      {
        link[n] = '\0';
        if (const char* slash = std::strrchr(link, '/'))
          driver = slash + 1;
        else
          driver = link;
      }
      char vendor[64];
      char device[64];
      std::snprintf(path, sizeof path, "/sys/class/drm/%s/device/vendor", name);
      if (!readFirstLine(path, vendor, sizeof vendor))
        std::snprintf(vendor, sizeof vendor, "?");
      std::snprintf(path, sizeof path, "/sys/class/drm/%s/device/device", name);
      if (!readFirstLine(path, device, sizeof device))
        std::snprintf(device, sizeof device, "?");
      hostLog("[calfnxt-%s] gfx drm %s driver=%s vendor=%s device=%s\n", t, name, driver, vendor,
              device);
      if (++found >= 8)
        break;
    }
    ::closedir(dir);
    if (found == 0)
      hostLog("[calfnxt-%s] gfx drm=(none)\n", t);
  }

  char nvidia[240];
  if (readFirstLine("/proc/driver/nvidia/version", nvidia, sizeof nvidia))
    hostLog("[calfnxt-%s] gfx nvidia=%s\n", t, nvidia);
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

bool resolveBundlePath(const char* webRoot, const char* requestPath, char* outFull, size_t outCap,
                       std::string* outRel)
{
  if (!webRoot || !outFull || outCap < 8)
    return false;
  const char* path = requestPath;
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
  if (outRel)
    *outRel = rel;
  std::snprintf(outFull, outCap, "%s/%s", webRoot, rel.c_str());
  return true;
}

const char* mimeForPath(const char* fullPath)
{
  if (!fullPath)
    return "application/octet-stream";
  if (std::strstr(fullPath, ".js"))
    return "text/javascript";
  if (std::strstr(fullPath, ".css"))
    return "text/css";
  if (std::strstr(fullPath, ".svg"))
    return "image/svg+xml";
  if (std::strstr(fullPath, ".png"))
    return "image/png";
  if (std::strstr(fullPath, ".woff2"))
    return "font/woff2";
  if (std::strstr(fullPath, ".ttf"))
    return "font/ttf";
  if (std::strstr(fullPath, ".html"))
    return "text/html";
  return "text/html";
}

std::string bridgeScriptSource(bool withDumpButton)
{
  static const char bridge[] =
    "window.__calfnxtHostQ=window.__calfnxtHostQ||[];"
    "window.__calfnxtUiVisible=true;"
    "window.__calfnxtVizDump=window.__calfnxtVizDump||{};"
    "window.__calfnxtDumpViz=function(){"
    "var bag=window.__calfnxtVizDump||{};"
    "var out={};"
    "for(var k in bag){if(!Object.prototype.hasOwnProperty.call(bag,k))continue;"
    "var v=bag[k];out[k]=v&&typeof v.slice==='function'?Array.prototype.slice.call(v):v;}"
    "var json=JSON.stringify(out,null,2);"
    "try{window.webkit.messageHandlers.calfnxt.postMessage('DUMPVIZ\\n'+json);}catch(e){}"
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
    "if(src.t==='meter'){"
    "if(src.cmd!=null)o.cmd=String(src.cmd);"
    "}"
    "window.webkit.messageHandlers.calfnxt.postMessage(JSON.stringify(o));}};"
    ;
  std::string bridgeSrc = bridge;
  if (!withDumpButton)
    return bridgeSrc;
  bridgeSrc +=
    "(function(){"
    "function mount(){"
    "if(document.getElementById('calfnxt-dump-viz'))return;"
    "var b=document.createElement('button');"
    "b.id='calfnxt-dump-viz';"
    "b.type='button';"
    "b.textContent='Dump viz';"
    "b.title='Write /tmp/calfnxt-viz-dump.json';"
    "b.style.cssText='position:fixed;top:4px;right:4px;z-index:2147483647;"
    "font:12px/1.2 sans-serif;padding:6px 10px;cursor:pointer;"
    "background:#222;color:#fff;border:1px solid #666;border-radius:3px;';"
    "b.addEventListener('click',function(ev){"
    "ev.preventDefault();ev.stopPropagation();"
    "if(typeof window.__calfnxtDumpViz==='function')window.__calfnxtDumpViz();"
    "b.textContent='Dumped';"
    "setTimeout(function(){b.textContent='Dump viz';},1200);"
    "});"
    "document.documentElement.appendChild(b);"
    "}"
    "if(document.readyState==='loading')"
    "document.addEventListener('DOMContentLoaded',mount);"
    "else mount();"
    "})();";
  return bridgeSrc;
}

void appendVizPackItem(std::vector<std::uint8_t>& pack, const VizBin::Decoded& dec)
{
  namespace VB = VizBin;
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

int parseCli(int argc, char** argv, CliArgs& out, const char* argv0Label)
{
  const char* label = argv0Label && argv0Label[0] ? argv0Label : "calfnxt-web-host";
  for (int i = 1; i < argc; ++i)
  {
    auto need = [&](const char* opt) -> const char* {
      if (i + 1 >= argc)
      {
        std::fprintf(stderr, "[%s] missing value for %s\n", label, opt);
        std::exit(2);
      }
      return argv[++i];
    };
    if (!std::strcmp(argv[i], "--fd"))
      out.fd = std::atoi(need("--fd"));
    else if (!std::strcmp(argv[i], "--parent"))
      out.parentXid = static_cast<unsigned long>(std::strtoull(need("--parent"), nullptr, 10));
    else if (!std::strcmp(argv[i], "--root"))
      std::snprintf(out.webRoot, sizeof out.webRoot, "%s", need("--root"));
    else if (!std::strcmp(argv[i], "--entry"))
      std::snprintf(out.entryHtml, sizeof out.entryHtml, "%s", need("--entry"));
    else if (!std::strcmp(argv[i], "--width"))
      out.width = std::atoi(need("--width"));
    else if (!std::strcmp(argv[i], "--height"))
      out.height = std::atoi(need("--height"));
    else if (!std::strcmp(argv[i], "--help") || !std::strcmp(argv[i], "-h"))
    {
      std::fprintf(stderr,
                   "Usage: %s --fd N --parent XID --root DIR --entry HTML "
                   "[--width W] [--height H]\n",
                   label);
      return 1;
    }
    else
    {
      std::fprintf(stderr, "[%s] unknown arg: %s\n", label, argv[i]);
      return 2;
    }
  }
  if (out.fd < 0 || !out.webRoot[0] || !out.entryHtml[0])
  {
    std::fprintf(stderr,
                 "Usage: %s --fd N --parent XID --root DIR --entry HTML "
                 "[--width W] [--height H]\n",
                 label);
    return 2;
  }
  // parent may be 0 for floating hosts; GTK3 embed still requires it.
  return 0;
}

} // namespace WebHostShared
} // namespace Ui
} // namespace calfNXT
