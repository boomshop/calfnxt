#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "sidechain_filter.h"
#include "smooth_gain.h"
#include "viz_source.h"

#include "delay_params.h"

#include <atomic>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Delay {

class DelayPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  DelayPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new DelayPlugin);
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
  const char* vizTempoId() const override { return "delay"; }

  OBJ_METHODS(DelayPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  static constexpr int kMaxDelay = 524288; // ~10.9 s @ 48 kHz
  static constexpr int kAddrMask = kMaxDelay - 1;

  enum MixMode : int
  {
    MixStereo = 0,
    MixPingPong = 1,
    MixLR = 2,
    MixRL = 3,
  };

  void resetProcessing();
  void updateTimingAndGains();
  void processSample(float inL, float inR, float& outL, float& outR);

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;

  float buffers_[2][kMaxDelay] {};
  int bufptr_ = 0;
  int age_ = 0;

  int deltimeL_ = 1;
  int deltimeR_ = 1;
  MixMode mixMode_ = MixPingPong;
  bool active_ = true;

  Dsp::SmoothGain amtL_;
  Dsp::SmoothGain amtR_;
  Dsp::SmoothGain fbL_;
  Dsp::SmoothGain fbR_;
  Dsp::SmoothGain dry_;
  Dsp::SmoothGain chmix_;

  /** Feedback-path tone (HP→LP) applied after buffer write — not LR-complementary. */
  Dsp::SidechainFilter fbFilter_;

  std::atomic<float> hostTempoBpm_ {120.f};
  std::atomic<int> hostTempoValid_ {0};
};

} // namespace Delay
} // namespace calfNXT
