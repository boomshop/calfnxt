#pragma once

// Must come first (setState/getState name-clash macros).
#include "public.sdk/source/vst/vstsinglecomponenteffect.h"

#include "pluginterfaces/gui/iplugview.h"

namespace calfNXT {
namespace Ui {
class IVizSource;
}

namespace Plugin {

/** Shared VST3 base: stereo I/O, float32/64, WebEditor.
 *
 * Plugin code on top: parameters, process(), setState/getState.
 */
class EffectBase : public Steinberg::Vst::SingleComponentEffect
{
public:
  explicit EffectBase(Steinberg::ViewRect editorSize = Steinberg::ViewRect(0, 0, 360, 420));

  Steinberg::tresult PLUGIN_API canProcessSampleSize(Steinberg::int32 symbolicSampleSize) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setBusArrangements(Steinberg::Vst::SpeakerArrangement* inputs,
                                                   Steinberg::int32 numIns,
                                                   Steinberg::Vst::SpeakerArrangement* outputs,
                                                   Steinberg::int32 numOuts) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setActive(Steinberg::TBool state) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setComponentHandler(Steinberg::Vst::IComponentHandler* handler) SMTG_OVERRIDE;
  Steinberg::IPlugView* PLUGIN_API createView(Steinberg::FIDString name) SMTG_OVERRIDE;

  OBJ_METHODS(EffectBase, Steinberg::Vst::SingleComponentEffect)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Steinberg::Vst::SingleComponentEffect)
  REFCOUNT_METHODS(Steinberg::Vst::SingleComponentEffect)

protected:
  void addStereoIO(const Steinberg::Vst::TChar* inName = nullptr,
                   const Steinberg::Vst::TChar* outName = nullptr);

  /** Last point from inputParameterChanges → plain value. */
  bool applyLastParamPlain(Steinberg::Vst::ProcessData& data, Steinberg::Vst::ParamID id,
                           float& plainOut);

  /** Plain from current normalized controller value (no queue). */
  void syncParamPlain(Steinberg::Vst::ParamID id, float& plainOut);

  /** Fill plains[0..count) from Parameter objects (plain values). */
  void readParamPlains(float* plains, int count);

  /** One pass over host queues (setNormalized), then readParamPlains.
   *  Prefer this over per-param applyLastParamPlain/syncParamPlain. */
  void syncParamPlains(Steinberg::Vst::ProcessData& data, float* plains, int count);

  /** Tell the host to re-read parameter values (defaults / after state load).
   *  Some hosts (e.g. Carla) ignore defaultNormalizedValue and cache 0 (= plain min). */
  void notifyHostParamValues();

  /** Entry HTML inside the bundle (Resources/). */
  virtual const char* editorHtml() const { return "index.html"; }

  /** Optional meter/analyzer telemetry for the WebEditor (nullptr = none). */
  virtual Ui::IVizSource* vizSource() { return nullptr; }

  Steinberg::ViewRect editorSize_;
};

} // namespace Plugin
} // namespace calfNXT
