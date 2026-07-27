#pragma once

#include "public.sdk/source/common/pluginview.h"
#include "public.sdk/source/vst/vsteditcontroller.h"
#include "public.sdk/source/vst/vstparameters.h"

#include <gtk/gtk.h>
#include <webkit2/webkit2.h>

#include "viz_source.h"

#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstddef>

namespace calfNXT {
namespace Ui {

/** VST3 editor: WebKitGTK + X11 embed + host run loop.
 *
 * Bridge (web → host): JSON via calfnxtNative.post
 *   {"t":"begin"|"set"|"end"|"sync","id":…}  (set uses q/d fixed-point)
 *   {"t":"viewport",w,h}  // CSS px from window.innerWidth/Height (once)
 * Host → web:
 *   window.__calfnxtOnHost({t:"param",id:…,v:…})
 *   window.__calfnxtOnHost({t:"io",ch:N})
 *   window.__calfnxtOnHost({t:"viz",id:"out",kind:"levels",v:[…]})
 *
 * Size: open at design CSS size from *.plugin.json. UI reports measured CSS
 * viewport; host/window pixels ÷ CSS → scale; resizeView(design × scale).
 * Override: CALFNXT_UI_SCALE (takes priority over measurement). No WebKit zoom.
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
  /** Push `{t:"io",ch}` from current output bus arrangement (no audio peaks). */
  void pushIoChannels();

  Steinberg::Vst::EditController* controller() const { return controller_; }

protected:
  virtual void onPageReady();
  virtual bool onWebMessage(const char* json);

private:
  void ensureGtk();
  bool openWeb(void* x11Parent);
  void closeWeb();
  void attachParamListeners();
  void detachParamListeners();
  void flushPendingParams();
  void pollParamsFromController();
  void flushViz();
  void flushVizLevels(const char* streamId, float* levels, int n);
  void flushVizArray(const char* streamId, const char* kind, float* values, int n);
  int queryIoChannelCount() const;
  void onWebProcessTerminated(WebKitWebProcessTerminationReason reason);

  void syncNativeSize();
  void requestHostSize();
  /** Apply design×scale via resizeView (no zoom). */
  bool applyDesignScale(double scale, const char* reason);
  /** CSS viewport from UI → scale = hostPx/cssPx → resize to design×scale. */
  bool applyCssViewport(int cssW, int cssH);

  static void onUriScheme(WebKitURISchemeRequest* request, gpointer userData);
  static void onScriptMessage(WebKitUserContentManager* manager, WebKitJavascriptResult* js,
                              gpointer userData);
  static void onLoadChanged(WebKitWebView* view, WebKitLoadEvent event, gpointer userData);
  static void onWebProcessTerminatedCb(WebKitWebView* view,
                                       WebKitWebProcessTerminationReason reason,
                                       gpointer userData);

  Steinberg::Vst::EditController* controller_ = nullptr;
  IVizSource* vizSource_ = nullptr;
  char entryHtml_[256] {};
  GtkWidget* plug_ = nullptr;
  WebKitWebView* webview_ = nullptr;
  WebKitWebContext* ctx_ = nullptr;
  Steinberg::IPtr<Steinberg::Linux::IRunLoop> runLoop_;
  bool timerRegistered_ = false;
  bool listeningParams_ = false;
  bool suppressParamPush_ = false;
  bool requestingHostResize_ = false;
  bool viewportApplied_ = false;
  char webRoot_[4096] {};
  std::chrono::steady_clock::time_point lastVizFlush_ {};

  /** Editor size from plugin descriptor (design CSS pixels). */
  Steinberg::int32 designWidth_ = 360;
  Steinberg::int32 designHeight_ = 420;

  static constexpr std::uint32_t kMaxQueuedParams = 16;
  static constexpr int kVizHz = 30;
  std::atomic<std::uint32_t> pendingParamMask_ {0};
  std::atomic<double> pendingParamPlain_[kMaxQueuedParams] {};
  double lastFlushedPlain_[kMaxQueuedParams] {};
  bool lastFlushedValid_[kMaxQueuedParams] {};
};

} // namespace Ui
} // namespace calfNXT
