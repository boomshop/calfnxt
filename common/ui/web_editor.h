#pragma once

#include "public.sdk/source/common/pluginview.h"
#include "public.sdk/source/vst/vsteditcontroller.h"
#include "public.sdk/source/vst/vstparameters.h"

#include "viz_source.h"

#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstddef>
#include <string>
#include <sys/types.h>

namespace calfNXT {
namespace Ui {

/**
 * VST3 editor proxy (host process): no GTK/WebKit.
 *
 * Spawns `calfnxt-web-host` (out-of-process GtkPlug + WebKit) and speaks the
 * same JSON bridge over a Unix socketpair — required so Ardour’s internalized
 * toolkit does not collide with system GTK3.
 *
 * Bridge (web → host): JSON via calfnxtNative.post
 *   {"t":"begin"|"set"|"end"|"sync","id":…}  (set uses q/d fixed-point)
 *   {"t":"viewport",w,h}
 * Host → web (via helper evalJs):
 *   window.__calfnxtOnHost({t:"param"|"io"|"viz",…})
 */
class WebEditor : public Steinberg::CPluginView, public Steinberg::Linux::ITimerHandler
{
public:
  WebEditor(Steinberg::Vst::EditController* controller, Steinberg::ViewRect size,
            const char* entryHtml = "index.html");
  ~WebEditor() override;

  void setVizSource(IVizSource* source) { vizSource_ = source; }

  Steinberg::tresult PLUGIN_API isPlatformTypeSupported(Steinberg::FIDString type) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API attached(void* parent, Steinberg::FIDString type) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API removed() SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API onSize(Steinberg::ViewRect* newSize) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API canResize() SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API checkSizeConstraint(Steinberg::ViewRect* rect) SMTG_OVERRIDE;
  void PLUGIN_API onTimer() SMTG_OVERRIDE;

  void PLUGIN_API update(Steinberg::FUnknown* changedUnknown,
                         Steinberg::int32 message) SMTG_OVERRIDE;

  OBJ_METHODS(WebEditor, Steinberg::CPluginView)
  DEFINE_INTERFACES
    DEF_INTERFACE(Steinberg::Linux::ITimerHandler)
  END_DEFINE_INTERFACES(Steinberg::CPluginView)
  REFCOUNT_METHODS(Steinberg::CPluginView)

  void evalJs(const char* js);
  void pushParamPlain(Steinberg::Vst::ParamID id, double plain);
  void pushAllParams();
  void pushIoChannels();

  Steinberg::Vst::EditController* controller() const { return controller_; }

protected:
  virtual void onPageReady();
  virtual bool onWebMessage(const char* json);

private:
  bool openHelper(void* x11Parent);
  void closeHelper();
  void attachParamListeners();
  void detachParamListeners();
  void flushPendingParams();
  void pollParamsFromController();
  void flushViz();
  void flushVizLevels(const char* streamId, float* levels, int n);
  void flushVizArray(const char* streamId, const char* kind, float* values, int n);
  int queryIoChannelCount() const;

  void requestHostSize();
  bool applyDesignScale(double scale, const char* reason);
  bool applyCssViewport(int cssW, int cssH);
  void sendHelperSize(int w, int h);

  bool sendLine(const char* line);
  void pumpSocket();
  void handleHelperLine(const std::string& line);
  void sendSizeToHelper();
  static bool findHelperPath(char* out, size_t cap);
  static void fillWebRoot(char* out, size_t cap);

  Steinberg::Vst::EditController* controller_ = nullptr;
  IVizSource* vizSource_ = nullptr;
  char entryHtml_[256] {};
  char webRoot_[4096] {};
  Steinberg::IPtr<Steinberg::Linux::IRunLoop> runLoop_;
  bool timerRegistered_ = false;
  bool listeningParams_ = false;
  bool suppressParamPush_ = false;
  bool requestingHostResize_ = false;
  bool viewportApplied_ = false;
  bool pageReady_ = false;
  int sock_ = -1;
  pid_t helperPid_ = -1;
  std::string readBuf_;
  std::chrono::steady_clock::time_point lastVizFlush_ {};
  std::chrono::steady_clock::time_point lastEnvVizFlush_ {};

  Steinberg::int32 designWidth_ = 360;
  Steinberg::int32 designHeight_ = 420;
  /** Last XEmbed socket size from helper `_socket` (0 = unknown). */
  int socketWidth_ = 0;
  int socketHeight_ = 0;

  // Headroom for large plugins (EQ ~195 today; multiband / future analyzers).
  static constexpr std::uint32_t kMaxQueuedParams = 1024;
  static constexpr int kVizHz = 30;
  static constexpr int kEnvVizHz = 30;
  std::atomic<bool> pendingParamDirty_[kMaxQueuedParams] {};
  std::atomic<double> pendingParamPlain_[kMaxQueuedParams] {};
  double lastFlushedPlain_[kMaxQueuedParams] {};
  bool lastFlushedValid_[kMaxQueuedParams] {};
};

} // namespace Ui
} // namespace calfNXT
