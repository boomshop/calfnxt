#pragma once

#include "effect_base.h"
#include "eq_band.h"
#include "io_stage.h"
#include "spectrum_tap.h"
#include "viz_source.h"

#include "equalizer_params.h"

#include <atomic>
#include <cstring>

namespace calfNXT {
namespace Equalizer {

class EqualizerPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  EqualizerPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new EqualizerPlugin);
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
  int takeBandGainsDb(float* out, int maxOut) override;
  int takeSpectrum(float* out, int maxOut) override;
  const char* vizSpectrumId() const override { return "fft"; }
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(EqualizerPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  void applyBandTargetsFromParams();
  bool hasAnyActiveBandsOrListen() const;
  void publishDisplayGains();

  float params_[kParamCount] {};
  float displayGainsDb_[kEqBandCount] {};
  Dsp::IoStage io_;
  Dsp::EqBandProcessor bands_[kEqBandCount];
  Dsp::SpectrumTap spectrum_;
  std::atomic<bool> spectrumActive_{false};
  double sampleRate_ = 44100.0;
  /** After one quiet block of zero-feed, IIR state is drained — further quiet can skip. */
  bool quietDrained_ = false;
};

} // namespace Equalizer
} // namespace calfNXT
