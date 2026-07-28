#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "viz_source.h"
#include "allpass.h"
#include "band_splitter.h"
#include "stereo_field_tap.h"

#include "stereo_params.h"

#include <vector>

namespace calfNXT {
namespace Stereo {

class StereoPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  StereoPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new StereoPlugin);
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
  int takeCorrelation(float* out, int maxOut) override;
  int takeGonio(float* out, int maxOut) override;

  OBJ_METHODS(StereoPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  void rebuildDelayBuffer();
  void updateDecorrelate();
  void processSample(float& L, float& R);

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;

  // Delay (interleaved L/R), up to ±20 ms. Time is ramped + fractional read.
  std::vector<float> delayBuf_;
  int delayPos_ = 0;
  float delayMsCur_ = 0.f;
  float delaySmoothCoeff_ = 1.f;

  Dsp::BandSplitter sideSplit_;
  Dsp::AllpassChain decorrL_;
  Dsp::AllpassChain decorrR_;
  Dsp::StereoFieldTap fieldTap_;
  float lastXover_ = -1.f;
  float lastSpread_ = -1.f;
  float lastSlope_ = -1.f;
  int lastStages_ = -1;
};

} // namespace Stereo
} // namespace calfNXT
