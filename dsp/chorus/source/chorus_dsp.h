#pragma once

#include "complementary_band_filter.h"
#include "effect_base.h"
#include "io_stage.h"
#include "simple_chorus.h"
#include "smooth_gain.h"
#include "viz_source.h"

#include "chorus_params.h"

#include <atomic>
#include <cmath>

namespace calfNXT {
namespace Chorus {

class ChorusPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  ChorusPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new ChorusPlugin);
  }

  Steinberg::tresult PLUGIN_API initialize(Steinberg::FUnknown* context) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setActive(Steinberg::TBool state) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setupProcessing(Steinberg::Vst::ProcessSetup& newSetup) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API process(Steinberg::Vst::ProcessData& data) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setState(Steinberg::IBStream* state) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API getState(Steinberg::IBStream* state) SMTG_OVERRIDE;

  Ui::IVizSource* vizSource() override { return this; }
  int takeInputLevelsDb(float* out, int maxOut) override { return io_.takeInputLevelsDb(out, maxOut); }
  int takeOutputLevelsDb(float* out, int maxOut) override { return io_.takeOutputLevelsDb(out, maxOut); }
  int takeChorusLfo(float* out, int maxOut) override;
  const char* vizChorusId() const override { return "chorus"; }

  OBJ_METHODS(ChorusPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  struct BlockState
  {
    bool active = true;
    bool lfo = true;
    bool reset = false;
    float minDelay = 5.f;
    float modDepth = 6.f;
    float modRate = 0.1f;
    float stereoDeg = 180.f;
    int voices = 4;
    float vphaseDeg = 64.f;
    float overlap = 0.75f;
    float amount = -6.f;
    float dry = 0.f;
    float hipass = 100.f;
    float lopass = 5000.f;
    float hpMode = 0.f;
    float lpMode = 0.f;
    bool listen = false;
  };

  BlockState makeBlockState() const;
  /** `forcePhase` re-anchors L/R LFO like Calf activate() / Reset. */
  void applyParams(const BlockState& s, bool forcePhase);
  void publishLfoViz();

  float params_[kParamCount] {};
  double sampleRate_ = 44100.0;
  Dsp::IoStage io_;
  Dsp::SimpleChorus left_;
  Dsp::SimpleChorus right_;
  Dsp::ComplementaryBandFilter post_;
  Dsp::SmoothGain amountGain_;
  Dsp::SmoothGain dryGain_;
  float lastRPhase_ = 0.5f; // turns (180° default)
  bool clearReset_ = false;

  std::atomic<float> phaseL_{0.f};
  std::atomic<float> phaseR_{0.5f};
};

} // namespace Chorus
} // namespace calfNXT
