#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "simple_phaser.h"
#include "viz_source.h"

#include "phaser_params.h"

#include <atomic>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Phaser {

class PhaserPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  PhaserPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new PhaserPlugin);
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
  int takeFreqResponse(float* out, int maxOut) override;
  const char* vizFreqResponseId() const override { return "mod"; }
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(PhaserPlugin, Plugin::EffectBase)
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
    float baseFreq = 1000.f;
    float modDepth = 4000.f;
    float modRate = 0.1f;
    float feedback = 0.5f;
    int stages = 6;
    float stereoDeg = 180.f;
    float amount = -6.f;
    float dry = 0.f;
  };

  BlockState makeBlockState() const;
  /** `forcePhase` re-anchors L/R LFO like Calf activate() / Reset. */
  void applyParams(const BlockState& s, bool forcePhase);
  void publishResponse();

  float params_[kParamCount] {};
  double sampleRate_ = 44100.0;
  Dsp::IoStage io_;
  Dsp::SimplePhaser left_;
  Dsp::SimplePhaser right_;
  float lastRPhase_ = 0.5f; // turns (180° default)
  bool clearReset_ = false;
  int respCountdown_ = 0;

  static constexpr int kMaxRespBins = 512;
  std::atomic<int> respBins_{128};
  float respL_[kMaxRespBins] {};
  float respR_[kMaxRespBins] {};
  std::atomic<bool> respReady_{false};
};

} // namespace Phaser
} // namespace calfNXT
