#pragma once

#include "dsp_math.h"
#include "effect_base.h"
#include "io_stage.h"
#include "simple_lfo.h"
#include "viz_source.h"

#include "pulsator_params.h"

#include <algorithm>
#include <atomic>

namespace calfNXT {
namespace Pulsator {

/** Clamp gain jumps so a full-scale step takes at least `ms` (anti-click). */
class RateLimitedGain
{
public:
  void setSampleRate(float sr, float ms = 1.5f)
  {
    const float n = std::max(1.f, (sr > 0.f ? sr : 44100.f) * ms * 0.001f);
    maxDelta_ = 1.f / n;
  }

  void reset(float v) { current_ = v; }

  float process(float target)
  {
    const float d = target - current_;
    if (d > maxDelta_)
      current_ += maxDelta_;
    else if (d < -maxDelta_)
      current_ -= maxDelta_;
    else
      current_ = target;
    Dsp::sanitizeDenormal(current_);
    return current_;
  }

private:
  float current_ = 1.f;
  float maxDelta_ = 1.f;
};

class PulsatorPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  PulsatorPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new PulsatorPlugin);
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
  int takeHostTempo(float* out, int maxOut) override;
  const char* vizTempoId() const override { return "pulsator"; }
  int takePulsatorLfo(float* out, int maxOut) override;
  const char* vizPulsatorId() const override { return "pulsator"; }

  OBJ_METHODS(PulsatorPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  struct BlockState
  {
    bool bypass = false;
    bool mono = false;
    bool sync = false;
    int mode = 0;
    int pulseWidth = 3;
    float amount = 1.f;
    float offsetL = 0.f;
    float offsetR = 0.5f;
    float bpm = 120.f;
    float freqHz = 2.f;
    float pw = 1.f;
  };

  BlockState makeBlockState() const;
  void resetProcessing();
  void applyLfoParams(const BlockState& s);
  void handleReset();
  void publishLfoViz();
  void updateHostTempo(Steinberg::Vst::ProcessData& data);
  static float pulseWidthFromEnum(int pw);

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;

  Dsp::SimpleLfo lfoL_;
  Dsp::SimpleLfo lfoR_;
  RateLimitedGain gainL_;
  RateLimitedGain gainR_;

  bool resetArmed_ = false;

  std::atomic<float> phaseL_{0.f};
  std::atomic<float> phaseR_{0.f};
  std::atomic<float> valL_{0.f};
  std::atomic<float> valR_{0.f};
  std::atomic<float> hostTempoBpm_{120.f};
  std::atomic<int> hostTempoValid_{0};
};

} // namespace Pulsator
} // namespace calfNXT
