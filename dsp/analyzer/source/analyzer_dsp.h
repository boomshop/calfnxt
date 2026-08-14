#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "spectrum_tap.h"
#include "stereo_field_tap.h"
#include "viz_source.h"

#include "analyzer_params.h"

namespace calfNXT {
namespace Analyzer {

class AnalyzerPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  AnalyzerPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new AnalyzerPlugin);
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
  int takeSpectrum(float* out, int maxOut) override;
  const char* vizSpectrumId() const override { return "fft"; }
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(AnalyzerPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;
  Dsp::SpectrumTap spectrum_;
  Dsp::StereoFieldTap fieldTap_;
};

} // namespace Analyzer
} // namespace calfNXT
