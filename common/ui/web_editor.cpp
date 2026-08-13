#include "web_editor.h"

#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/vstspeaker.h"

#include <algorithm>
#include <cstdarg>
#include <charconv>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <spawn.h>
#include <signal.h>
#include <string>
#include <sys/socket.h>
#include <sys/wait.h>
#include <unistd.h>
#include <vector>

extern char** environ;

namespace calfNXT {
namespace Ui {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {

void dlAnchor() {}

/** Always-visible diagnostics: stderr may be swallowed by bridged hosts. */
void logMsgFile(const char* line)
{
  if (!line || !line[0])
    return;
  const int fd = ::open("/tmp/calfnxt-ui.log", O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0644);
  if (fd < 0)
    return;
  (void)::write(fd, line, std::strlen(line));
  ::close(fd);
}

void logBoth(const char* fmt, ...)
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
  logMsgFile(buf);
}

struct SuppressParamPush
{
  bool& flag;
  explicit SuppressParamPush(bool& f) : flag(f) { flag = true; }
  ~SuppressParamPush() { flag = false; }
};

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

bool jsonStringAfterKey(const char* s, const char* key, char* out, size_t outSize)
{
  if (!s || !key || !out || outSize < 2)
    return false;
  const char* p = std::strstr(s, key);
  if (!p)
    return false;
  p = std::strchr(p, ':');
  if (!p)
    return false;
  ++p;
  while (*p == ' ' || *p == '\t')
    ++p;
  if (*p != '"')
    return false;
  ++p;
  size_t n = 0;
  while (*p && *p != '"' && n + 1 < outSize)
    out[n++] = *p++;
  if (*p != '"')
    return false;
  out[n] = '\0';
  return true;
}

bool envFlag(const char* name)
{
  const char* s = std::getenv(name);
  return s != nullptr && s[0] != '\0';
}

float envFloat(const char* name)
{
  const char* s = std::getenv(name);
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

void logMsg(const char* fmt, ...)
{
  char buf[512];
  va_list ap;
  va_start(ap, fmt);
  std::vsnprintf(buf, sizeof buf, fmt, ap);
  va_end(ap);
  logMsgFile(buf);
  if (!envFlag("CALFNXT_WEB_DEBUG"))
    return;
  std::fputs(buf, stderr);
  std::fflush(stderr);
}

} // namespace

void WebEditor::fillWebRoot(char* out, size_t cap)
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

bool WebEditor::findHelperPath(char* out, size_t cap)
{
  Dl_info info {};
  if (dladdr(reinterpret_cast<void*>(&dlAnchor), &info) && info.dli_fname)
  {
    std::string so(info.dli_fname);
    auto slash = so.rfind('/');
    if (slash != std::string::npos)
    {
      std::snprintf(out, cap, "%s/calfnxt-web-host", so.substr(0, slash).c_str());
      if (access(out, X_OK) == 0)
        return true;
    }
  }
  std::snprintf(out, cap, "calfnxt-web-host");
  return access(out, X_OK) == 0;
}

WebEditor::WebEditor(EditController* controller, ViewRect size, const char* entryHtml)
: CPluginView(nullptr)
, controller_(controller)
{
  designWidth_ = std::max<int32>(1, size.getWidth());
  designHeight_ = std::max<int32>(1, size.getHeight());
  rect = ViewRect(0, 0, designWidth_, designHeight_);
  std::snprintf(entryHtml_, sizeof entryHtml_, "%s", entryHtml ? entryHtml : "index.html");
}

WebEditor::~WebEditor()
{
  detachParamListeners();
  closeHelper();
}

tresult PLUGIN_API WebEditor::isPlatformTypeSupported(FIDString type)
{
  if (type && std::strcmp(type, kPlatformTypeX11EmbedWindowID) == 0)
    return kResultTrue;
  return kResultFalse;
}

bool WebEditor::sendLine(const char* line)
{
  if (sock_ < 0 || !line)
    return false;
  const size_t n = std::strlen(line);
  std::string msg;
  msg.reserve(n + 1);
  msg.append(line, n);
  if (n == 0 || line[n - 1] != '\n')
    msg.push_back('\n');

  const char* p = msg.data();
  size_t left = msg.size();
  while (left > 0)
  {
    const ssize_t w = ::write(sock_, p, left);
    if (w < 0)
    {
      if (errno == EINTR)
        continue;
      if (errno == EAGAIN || errno == EWOULDBLOCK)
      {
        // Bulk param sync can fill the socket; wait longer than one frame.
        pollfd pfd {sock_, POLLOUT, 0};
        if (poll(&pfd, 1, 250) <= 0)
          return false;
        continue;
      }
      logMsg("[calfnxt] socket write failed: %s\n", std::strerror(errno));
      return false;
    }
    p += static_cast<size_t>(w);
    left -= static_cast<size_t>(w);
  }
  return true;
}

void WebEditor::sendSizeToHelper()
{
  sendHelperSize(rect.getWidth(), rect.getHeight());
}

void WebEditor::sendHelperSize(int w, int h)
{
  if (w < 1 || h < 1)
    return;
  char line[96];
  std::snprintf(line, sizeof line, "{\"t\":\"_size\",\"w\":%d,\"h\":%d}", w, h);
  sendLine(line);
}

void WebEditor::handleHelperLine(const std::string& line)
{
  if (line.empty())
    return;
  if (jsonHasType(line.c_str(), "_socket"))
  {
    double w = 0.0;
    double h = 0.0;
    if (jsonNumberAfterKey(line.c_str(), "\"w\"", w)
        && jsonNumberAfterKey(line.c_str(), "\"h\"", h) && w >= 2.0 && h >= 2.0)
    {
      socketWidth_ = static_cast<int>(std::lround(w));
      socketHeight_ = static_cast<int>(std::lround(h));
      logMsg("[calfnxt] socket size %dx%d (design %dx%d)\n", socketWidth_, socketHeight_,
             designWidth_, designHeight_);
    }
    return;
  }
  if (jsonHasType(line.c_str(), "_ready"))
  {
    for (std::uint32_t i = 0; i < kMaxQueuedParams; ++i)
    {
      lastFlushedValid_[i] = false;
      pendingParamDirty_[i].store(false, std::memory_order_relaxed);
    }
    lastVizFlush_ = {};
    lastEnvVizFlush_ = {};
    onPageReady();
    return;
  }
  if (jsonHasType(line.c_str(), "_jserr") || jsonHasType(line.c_str(), "_diag"))
  {
    logBoth("[calfnxt] UI %s\n", line.c_str());
    return;
  }
  onWebMessage(line.c_str());
}

void WebEditor::pumpSocket()
{
  if (sock_ < 0)
    return;

  char chunk[4096];
  for (;;)
  {
    const ssize_t n = ::read(sock_, chunk, sizeof chunk);
    if (n < 0)
    {
      if (errno == EINTR)
        continue;
      if (errno == EAGAIN || errno == EWOULDBLOCK)
        break;
      logMsg("[calfnxt] socket read failed: %s\n", std::strerror(errno));
      closeHelper();
      return;
    }
    if (n == 0)
    {
      logMsg("[calfnxt] web-host socket closed\n");
      closeHelper();
      return;
    }
    readBuf_.append(chunk, static_cast<size_t>(n));
    for (;;)
    {
      const auto pos = readBuf_.find('\n');
      if (pos == std::string::npos)
        break;
      std::string line = readBuf_.substr(0, pos);
      readBuf_.erase(0, pos + 1);
      while (!line.empty() && (line.back() == '\r' || line.back() == ' '))
        line.pop_back();
      handleHelperLine(line);
    }
  }
}

bool WebEditor::openHelper(void* x11Parent)
{
  if (!x11Parent)
    return false;

  closeHelper();
  fillWebRoot(webRoot_, sizeof webRoot_);

  char helperPath[4096];
  if (!findHelperPath(helperPath, sizeof helperPath))
  {
    logBoth("[calfnxt] calfnxt-web-host not found next to plugin .so\n");
    return false;
  }

  // Always log attach paths — empty editor windows are otherwise silent in hosts.
  logBoth("[calfnxt] editor: helper=%s root=%s entry=%s\n",
          helperPath, webRoot_, entryHtml_);

  // entry may be "index.html#plugin" (URI fragment for SPA routing) — not a filesystem name.
  char entryFile[256];
  std::snprintf(entryFile, sizeof entryFile, "%s", entryHtml_);
  if (char* hash = std::strchr(entryFile, '#'))
    *hash = '\0';
  if (char* query = std::strchr(entryFile, '?'))
    *query = '\0';
  if (!entryFile[0])
    std::snprintf(entryFile, sizeof entryFile, "index.html");

  char indexPath[4224];
  std::snprintf(indexPath, sizeof indexPath, "%s/%s", webRoot_, entryFile);
  if (access(indexPath, R_OK) != 0)
  {
    logBoth("[calfnxt] editor UI missing: %s (build *-resources / install-user-vst3)\n",
            indexPath);
  }

  int sp[2] = {-1, -1};
  if (socketpair(AF_UNIX, SOCK_STREAM, 0, sp) != 0)
  {
    logBoth("[calfnxt] socketpair failed: %s\n", std::strerror(errno));
    return false;
  }

  posix_spawn_file_actions_t actions;
  if (posix_spawn_file_actions_init(&actions) != 0)
  {
    ::close(sp[0]);
    ::close(sp[1]);
    return false;
  }
  posix_spawn_file_actions_addclose(&actions, sp[0]);

  char fdArg[32];
  char parentArg[32];
  char widthArg[32];
  char heightArg[32];
  std::snprintf(fdArg, sizeof fdArg, "%d", sp[1]);
  std::snprintf(parentArg, sizeof parentArg, "%llu",
                static_cast<unsigned long long>(reinterpret_cast<uintptr_t>(x11Parent)));
  std::snprintf(widthArg, sizeof widthArg, "%d", rect.getWidth());
  std::snprintf(heightArg, sizeof heightArg, "%d", rect.getHeight());

  char* argv[] = {
    helperPath,
    const_cast<char*>("--fd"),
    fdArg,
    const_cast<char*>("--parent"),
    parentArg,
    const_cast<char*>("--root"),
    webRoot_,
    const_cast<char*>("--entry"),
    entryHtml_,
    const_cast<char*>("--width"),
    widthArg,
    const_cast<char*>("--height"),
    heightArg,
    nullptr,
  };

  pid_t pid = -1;
  const int rc = posix_spawn(&pid, helperPath, &actions, nullptr, argv, environ);
  posix_spawn_file_actions_destroy(&actions);
  ::close(sp[1]);

  if (rc != 0)
  {
    logBoth("[calfnxt] posix_spawn(%s) failed: %s\n", helperPath, std::strerror(rc));
    ::close(sp[0]);
    return false;
  }

  const int flags = fcntl(sp[0], F_GETFL, 0);
  if (flags >= 0)
    fcntl(sp[0], F_SETFL, flags | O_NONBLOCK);

  sock_ = sp[0];
  helperPid_ = pid;
  pageReady_ = false;
  readBuf_.clear();
  logBoth("[calfnxt] spawned web-host pid=%d\n", static_cast<int>(pid));

  // Catch immediate helper failure (missing libs / gtk_init / bad DISPLAY) before
  // the host paints an empty embed forever. Dynamic-linker errors go to the child's
  // stderr (same terminal); we only see the exit here.
  for (int i = 0; i < 10; ++i)
  {
    int status = 0;
    const pid_t r = waitpid(helperPid_, &status, WNOHANG);
    if (r == helperPid_)
    {
      if (WIFEXITED(status))
      {
        logBoth("[calfnxt] web-host exited immediately (code=%d) — check deps "
                "(webkit2gtk-4.1, gtk-3) and DISPLAY/X11; try: %s --help\n",
                WEXITSTATUS(status), helperPath);
      }
      else if (WIFSIGNALED(status))
      {
        logBoth("[calfnxt] web-host died immediately (signal=%d)\n", WTERMSIG(status));
      }
      ::close(sock_);
      sock_ = -1;
      helperPid_ = -1;
      return false;
    }
    if (r < 0 && errno == ECHILD)
      break;
    usleep(10 * 1000);
  }
  return true;
}

void WebEditor::closeHelper()
{
  if (timerRegistered_ && runLoop_)
  {
    runLoop_->unregisterTimer(this);
    timerRegistered_ = false;
  }
  runLoop_ = nullptr;

  if (sock_ >= 0)
  {
    ::shutdown(sock_, SHUT_RDWR);
    ::close(sock_);
    sock_ = -1;
  }
  readBuf_.clear();
  pageReady_ = false;

  if (helperPid_ > 0)
  {
    kill(helperPid_, SIGTERM);
    for (int i = 0; i < 50; ++i)
    {
      int status = 0;
      const pid_t r = waitpid(helperPid_, &status, WNOHANG);
      if (r == helperPid_ || (r < 0 && errno == ECHILD))
        break;
      usleep(10 * 1000);
    }
    int status = 0;
    if (waitpid(helperPid_, &status, WNOHANG) == 0)
    {
      kill(helperPid_, SIGKILL);
      waitpid(helperPid_, &status, 0);
    }
    helperPid_ = -1;
  }
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
  sendSizeToHelper();
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

  if (const float envScale = envFloat("CALFNXT_UI_SCALE"))
    return applyDesignScale(envScale, "CALFNXT_UI_SCALE");

  const int hostW = std::max(1, rect.getWidth());
  const int hostH = std::max(1, rect.getHeight());
  const double scaleW = static_cast<double>(hostW) / static_cast<double>(cssW);
  const double scaleH = static_cast<double>(hostH) / static_cast<double>(cssH);
  double scale = 0.5 * (scaleW + scaleH);
  if (!(scale > 0.05 && scale < 8.0))
    scale = 1.0;

  logMsg("[calfnxt] viewport: host %dx%d / css %dx%d → scale=%.3f (design %dx%d, socket %dx%d)\n",
         hostW, hostH, cssW, cssH, scale, designWidth_, designHeight_, socketWidth_,
         socketHeight_);

  // Qtractor/Qt: XEmbed socket is already ≈ design×DPR while VST rect is still
  // design. Enlarging again double-scales. Keep design-sized VST size; fill the
  // helper to the socket so the UI occupies the window. Carla/Ardour keep a
  // design-sized socket → fall through to applyDesignScale.
  const int slack = 24;
  if (socketWidth_ >= designWidth_ + slack || socketHeight_ >= designHeight_ + slack)
  {
    viewportApplied_ = true;
    logMsg("[calfnxt] skip enlarge (socket %dx%d > design) — fill helper to socket\n",
           socketWidth_, socketHeight_);
    sendHelperSize(socketWidth_, socketHeight_);
    return true;
  }

  return applyDesignScale(scale, "viewport");
}

tresult PLUGIN_API WebEditor::attached(void* parent, FIDString type)
{
  logBoth("[calfnxt] attached parent=%p type=%s\n", parent, type ? type : "(null)");

  if (isPlatformTypeSupported(type) != kResultTrue)
  {
    logBoth("[calfnxt] attached: unsupported platform type '%s' (need X11EmbedWindowID)\n",
            type ? type : "(null)");
    return kResultFalse;
  }

  if (!parent)
  {
    logBoth("[calfnxt] attached: null X11 parent\n");
    return kResultFalse;
  }

  viewportApplied_ = false;
  socketWidth_ = 0;
  socketHeight_ = 0;
  rect = ViewRect(0, 0, designWidth_, designHeight_);

  if (!openHelper(parent))
  {
    logBoth("[calfnxt] attached: openHelper failed\n");
    return kResultFalse;
  }

  if (plugFrame)
  {
    Linux::IRunLoop* rl = nullptr;
    if (plugFrame->queryInterface(Linux::IRunLoop::iid, (void**)&rl) == kResultOk && rl)
    {
      runLoop_ = rl;
      rl->release();
      if (runLoop_->registerTimer(this, 16) == kResultOk)
        timerRegistered_ = true;
      else
        logBoth("[calfnxt] IRunLoop::registerTimer failed — UI bridge will not pump\n");
    }
    else
      logBoth("[calfnxt] host has no Linux::IRunLoop — UI bridge will not pump\n");
    requestHostSize();
    if (const float envScale = envFloat("CALFNXT_UI_SCALE"))
      applyDesignScale(envScale, "CALFNXT_UI_SCALE");
  }
  else
    logBoth("[calfnxt] attached: plugFrame is null\n");

  return CPluginView::attached(parent, type);
}

tresult PLUGIN_API WebEditor::removed()
{
  detachParamListeners();
  closeHelper();
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
  sendSizeToHelper();
  return kResultTrue;
}

void PLUGIN_API WebEditor::onTimer()
{
  pumpSocket();
  if (sock_ < 0 || !pageReady_)
    return;
  pollParamsFromController();
  flushPendingParams();
  flushViz();
}

void WebEditor::evalJs(const char* js)
{
  if (!js || sock_ < 0)
    return;
  sendLine(js);
}

void WebEditor::pushParamPlain(ParamID id, double plain)
{
  if (sock_ < 0 || id >= kMaxQueuedParams)
    return;
  pendingParamPlain_[id].store(plain, std::memory_order_relaxed);
  pendingParamDirty_[id].store(true, std::memory_order_release);
}

void WebEditor::pollParamsFromController()
{
  if (suppressParamPush_ || !controller_ || sock_ < 0)
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
  for (std::uint32_t id = 0; id < kMaxQueuedParams; ++id)
  {
    if (!pendingParamDirty_[id].load(std::memory_order_acquire))
      continue;
    const double plain = pendingParamPlain_[id].load(std::memory_order_relaxed);
    char num[64];
    const auto [endp, ec] = std::to_chars(num, num + sizeof num, plain,
                                          std::chars_format::general, 17);
    if (ec != std::errc())
    {
      pendingParamDirty_[id].store(false, std::memory_order_release);
      continue;
    }
    *endp = '\0';
    char js[256];
    std::snprintf(js, sizeof js,
                  "window.__calfnxtOnHost && window.__calfnxtOnHost({t:\"param\",id:%u,v:%s});",
                  id, num);
    // Only clear dirty / record last-flushed after a successful write. A full
    // push (EQ has ~195 params) can fill the socket; failed sends must retry
    // on the next timer tick instead of being silently dropped forever.
    if (!sendLine(js))
      break;
    pendingParamDirty_[id].store(false, std::memory_order_release);
    lastFlushedPlain_[id] = plain;
    lastFlushedValid_[id] = true;
  }
}

void WebEditor::flushVizLevels(const char* streamId, float* levels, int n)
{
  flushVizArray(streamId, "levels", levels, n);
}

void WebEditor::flushVizArray(const char* streamId, const char* kind, float* values, int n)
{
  if (sock_ < 0 || !streamId || !kind || n < 0)
    return;

  // Multiband envelope: up to 6×(512×3)+1 floats. A fixed 24 KiB stack buffer
  // overflowed once values stopped being short zeros — flush aborted silently
  // and history froze until bypass reset cleared the ring.
  constexpr size_t kHeaderReserve = 128;
  constexpr size_t kBytesPerFloat = 18; // worst-case to_chars + comma
  const size_t jsCap =
    std::max<size_t>(24576, kHeaderReserve + static_cast<size_t>(n) * kBytesPerFloat + 32);

  thread_local std::vector<char> jsBuf;
  if (jsBuf.size() < jsCap)
    jsBuf.resize(jsCap);
  char* js = jsBuf.data();
  char* p = js;
  char* end = js + jsCap;
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
                                          std::chars_format::general, 6);
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
  if (!vizSource_ || sock_ < 0)
    return;

  using clock = std::chrono::steady_clock;
  const auto now = clock::now();

  if (lastEnvVizFlush_.time_since_epoch().count() == 0
      || now - lastEnvVizFlush_ >= std::chrono::milliseconds(1000 / kEnvVizHz))
  {
    lastEnvVizFlush_ = now;
    constexpr int kMaxEnvFloats = 6 * (512 * 3) + 1;
    float envBuf[kMaxEnvFloats];
    const int nEnv = vizSource_->takeEnvelopeDisplay(envBuf, kMaxEnvFloats);
    if (nEnv > 0)
    {
      for (int i = 0; i < nEnv; ++i)
      {
        float v = envBuf[i];
        if (!std::isfinite(v))
          v = 0.f;
        envBuf[i] = v;
      }
      flushVizArray(vizSource_->vizEnvelopeId(), "envelope", envBuf, nEnv);
    }
  }

  if (lastVizFlush_.time_since_epoch().count() != 0)
  {
    const auto minGap = std::chrono::milliseconds(1000 / kVizHz);
    if (now - lastVizFlush_ < minGap)
      return;
  }
  lastVizFlush_ = now;

  if (const char* tempoId = vizSource_->vizTempoId())
  {
    float tempo[2] {};
    if (vizSource_->takeHostTempo(tempo, 2) == 2)
      flushVizArray(tempoId, "tempo", tempo, 2);
  }

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

  float corr = 0.f;
  if (vizSource_->takeCorrelation(&corr, 1) > 0)
  {
    if (!std::isfinite(corr))
      corr = 0.f;
    corr = std::clamp(corr, -1.f, 1.f);
    flushVizArray(vizSource_->vizStereoFieldId(), "corr", &corr, 1);
  }

  constexpr int kMaxGonio = 256;
  float gonio[kMaxGonio];
  const int nGonio = vizSource_->takeGonio(gonio, kMaxGonio);
  if (nGonio >= 0)
  {
    for (int i = 0; i < nGonio; ++i)
    {
      float v = gonio[i];
      if (!std::isfinite(v))
        v = 0.f;
      else
        v = std::clamp(v, -2.f, 2.f);
      gonio[i] = v;
    }
    flushVizArray(vizSource_->vizStereoFieldId(), "gonio", gonio, nGonio);
  }

  float grDb[32] {};
  const int nGr = vizSource_->takeGainReductionDb(grDb, 32);
  if (nGr > 0)
  {
    for (int i = 0; i < nGr; ++i)
    {
      if (!std::isfinite(grDb[i]))
        grDb[i] = 0.f;
      grDb[i] = std::clamp(grDb[i], -60.f, 0.f);
    }
    flushVizArray(vizSource_->vizDynamicsId(), "gr", grDb, nGr);
  }

  if (const char* bandIoId = vizSource_->vizBandIoLevelsId())
  {
    float bandIo[64] {};
    const int nIo = vizSource_->takeBandIoLevelsDb(bandIo, 64);
    if (nIo > 0)
    {
      for (int i = 0; i < nIo; ++i)
      {
        if (!std::isfinite(bandIo[i]))
          bandIo[i] = -96.f;
        bandIo[i] = std::clamp(bandIo[i], -96.f, 12.f);
      }
      flushVizArray(bandIoId, "bandio", bandIo, nIo);
    }
  }

  float point[32] {};
  const int nPt = vizSource_->takeDynamicsPoint(point, 32);
  if (nPt >= 2)
  {
    for (int i = 0; i < nPt; ++i)
    {
      if (!std::isfinite(point[i]))
        point[i] = -96.f;
      point[i] = std::clamp(point[i], -96.f, 24.f);
    }
    flushVizArray(vizSource_->vizDynamicsId(), "point", point, nPt);
  }

  if (const char* shapeId = vizSource_->vizShapeId())
  {
    // [zone, bin…] — see IVizSource::takeShapePoint
    float shape[65] {};
    const int nShape = vizSource_->takeShapePoint(shape, 65);
    if (nShape >= 2)
    {
      for (int i = 0; i < nShape; ++i)
      {
        if (!std::isfinite(shape[i]))
          shape[i] = 0.f;
        shape[i] = std::clamp(shape[i], 0.f, 1.f);
      }
      flushVizArray(shapeId, "shape", shape, nShape);
    }
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
  if (sock_ < 0)
    return;
  const int ch = queryIoChannelCount();
  char js[128];
  std::snprintf(js, sizeof js,
                "window.__calfnxtOnHost && window.__calfnxtOnHost({t:\"io\",ch:%d});", ch);
  evalJs(js);
}

void WebEditor::onPageReady()
{
  pageReady_ = true;
  logMsg("[calfnxt] page ready (design %dx%d, rect %dx%d)\n", designWidth_, designHeight_,
         rect.getWidth(), rect.getHeight());
  attachParamListeners();
  pushAllParams();
  pushIoChannels();
  flushPendingParams();
  sendSizeToHelper();
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
    // Force a full re-push even if values match the last attempt (UI may have
    // missed earlier messages before hostApplies were registered).
    for (std::uint32_t i = 0; i < kMaxQueuedParams; ++i)
      lastFlushedValid_[i] = false;
    pushAllParams();
    pushIoChannels();
    flushPendingParams();
    return true;
  }

  if (jsonHasType(json, "vizcfg"))
  {
    if (!vizSource_)
      return true;
    double binsf = 0.0;
    char id[64];
    if (!jsonStringAfterKey(json, "\"id\"", id, sizeof id)
        || !jsonNumberAfterKey(json, "\"bins\"", binsf))
      return false;
    vizSource_->configureVizBins(id, static_cast<int>(std::lround(binsf)));
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
