#pragma once

#include "biquad.h"
#include "delay_line.h"
#include "effect_base.h"
#include "io_stage.h"
#include "reverb_er.h"
#include "reverb_late.h"
#include "reverb_width.h"
#include "sidechain_filter.h"
#include "smooth_gain.h"
#include "viz_source.h"

#include "reverb_params.h"

#include <cmath>

namespace calfNXT {
namespace Reverb {

class ReverbPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  ReverbPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new ReverbPlugin);
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

  OBJ_METHODS(ReverbPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  static constexpr int kPredelaySize = 131072;
  /** Below this |wet/tank| peak the engine may sleep (never cut audible tails). */
  static constexpr float kIdleResidual = 1.0e-5f;

  void resetProcessing();
  void updateFromParams();
  void processSample(float inL, float inR, float& outL, float& outR);
  void processDryOnly(float inL, float inR, float& outL, float& outR);
  /** True while freeze/gate or any ER/predelay/late/wet residual remains. */
  bool engineHasTail() const;
  void applyDryGainBlock(Steinberg::Vst::ProcessData& data);
  void beginTailPeakBlock();
  void endTailPeakBlock();

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;

  Dsp::SidechainFilter tone_;
  Dsp::BiquadD1 airL_, airR_;

  Dsp::ReverbEr er_;
  Dsp::ReverbDiffuse diffuse_;
  Dsp::StereoPredelay<kPredelaySize> predelay_;
  Dsp::ReverbLate late_;
  Dsp::ReverbWidth width_;

  Dsp::SmoothGain dryGain_;
  Dsp::SmoothGain wetGain_;
  Dsp::SmoothGain erGain_;
  Dsp::SmoothGain lateGain_;
  Dsp::SmoothGain duckGain_;
  Dsp::SmoothGain gateGain_;

  int predelaySamples_ = 1;
  float diffuseAmt_ = 0.35f;
  int pathMode_ = 0;
  bool active_ = true;
  bool freeze_ = false;
  bool listen_ = false;
  bool gateOn_ = false;
  bool erOn_ = true;
  bool widthOn_ = false;
  bool airOn_ = false;
  bool duckOn_ = false;
  float duckAmt_ = 0.f;
  float gateThreshLin_ = 0.063f;
  float gateHoldSamples_ = 1.f;
  float gateReleaseCoeff_ = 0.f;
  float duckAttackCoeff_ = 0.f;
  float duckReleaseCoeff_ = 0.f;

  float envDuck_ = 0.f;
  float envGate_ = 0.f;
  float gateHoldCounter_ = 0.f;
  bool gateOpen_ = false;

  float airAmt_ = 0.25f;

  /** Peak |ER/late/predelay/wet| from the previous processed block (tail gate). */
  float lastTailPeak_ = 0.f;
  float blockTailPeak_ = 0.f;
};

} // namespace Reverb
} // namespace calfNXT
