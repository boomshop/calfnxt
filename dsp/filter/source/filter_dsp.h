#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "multimode_filter.h"
#include "spectrum_tap.h"
#include "viz_source.h"

#include "filter_params.h"

#include <atomic>

namespace calfNXT {
namespace Filter {

class FilterPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  FilterPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new FilterPlugin);
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
  int takeFilterCutoffHz(float* out, int maxOut) override;
  const char* vizFilterCutoffId() const override { return "filt"; }
  int takeSpectrum(float* out, int maxOut) override;
  const char* vizSpectrumId() const override { return "fft"; }
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(FilterPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  struct BlockState
  {
    bool bypass = false;
    bool envOn = false;
    bool spectrumOn = false;
    int mode = 0;
    float resonance = 0.707f;
    float frequency = 1000.f;
    float inertiaMs = 20.f;
    float mix = 1.f;
    float softClip = 0.f;
    float target = 4000.f;
    float activationLin = 1.f;
    float attackMs = 20.f;
    float releaseMs = 200.f;
    Dsp::DetectorMode detection = Dsp::DetectorMode::Peak;
  };

  BlockState makeBlockState() const;
  void resetProcessing();

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;

  Dsp::MultimodeFilter filter_;
  Dsp::LevelEnvelope envelope_;
  Dsp::SpectrumTap spectrum_;
  std::atomic<bool> spectrumActive_{false};
  std::atomic<float> effectiveCutoffHz_ { 1000.f };
};

} // namespace Filter
} // namespace calfNXT
