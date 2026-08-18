#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "simple_flanger.h"
#include "viz_source.h"

#include "flanger_params.h"

#include <atomic>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Flanger {

class FlangerPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  FlangerPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new FlangerPlugin);
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
  int takeCombExtrema(float* out, int maxOut) override;
  const char* vizCombExtremaId() const override { return "mod"; }

  OBJ_METHODS(FlangerPlugin, Plugin::EffectBase)
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
    float minDelay = 0.5f;
    float modDepth = 2.f;
    float modRate = 0.1f;
    float feedback = 0.8f;
    float stereoDeg = 90.f;
    float amount = -6.f;
    float dry = 0.f;
  };

  BlockState makeBlockState() const;
  /** `forcePhase` re-anchors L/R LFO like Calf activate() / Reset. */
  void applyParams(const BlockState& s, bool forcePhase);
  void publishComb();

  float params_[kParamCount] {};
  double sampleRate_ = 44100.0;
  Dsp::IoStage io_;
  Dsp::SimpleFlanger left_;
  Dsp::SimpleFlanger right_;
  float lastRPhase_ = 0.25f; // turns (90° default)
  bool clearReset_ = false;
  int combCountdown_ = 0;

  static constexpr int kMaxTeeth = 128;
  static constexpr int kMaxCombFloats = 2 + 4 * kMaxTeeth;
  float combOut_[kMaxCombFloats] {};
  int combOutN_ = 0;
  float vizDelayL_ = 0.f;
  float vizDelayR_ = 0.f;
  bool vizDelayInit_ = false;
  std::atomic<bool> combReady_{false};
};

} // namespace Flanger
} // namespace calfNXT
