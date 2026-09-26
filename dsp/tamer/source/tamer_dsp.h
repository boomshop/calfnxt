#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "channel_mode.h"
#include "spectral_tamer.h"
#include "viz_source.h"

#include "tamer_params.h"

namespace calfNXT {
namespace Tamer {

class TamerPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  TamerPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new TamerPlugin);
  }

  Steinberg::tresult PLUGIN_API initialize(Steinberg::FUnknown* context) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setActive(Steinberg::TBool state) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setupProcessing(Steinberg::Vst::ProcessSetup& newSetup) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API process(Steinberg::Vst::ProcessData& data) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setState(Steinberg::IBStream* state) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API getState(Steinberg::IBStream* state) SMTG_OVERRIDE;
  Steinberg::uint32 PLUGIN_API getLatencySamples() SMTG_OVERRIDE;

  Ui::IVizSource* vizSource() override { return this; }
  int takeInputLevelsDb(float* out, int maxOut) override { return io_.takeInputLevelsDb(out, maxOut); }
  int takeOutputLevelsDb(float* out, int maxOut) override { return io_.takeOutputLevelsDb(out, maxOut); }
  int takeSpectrum(float* out, int maxOut) override;
  const char* vizSpectrumId() const override { return "fft"; }
  int takeFreqResponse(float* out, int maxOut) override;
  const char* vizFreqResponseId() const override { return "tamer"; }
  int takeHarmonicGuides(float* out, int maxOut) override;
  const char* vizHarmonicGuidesId() const override { return "tamer"; }
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(TamerPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  struct BlockState
  {
    bool bypass = false;
    bool diffListen = false;
    Dsp::ChannelMode channel = Dsp::ChannelMode::Stereo;
    float fLo = 200.f;
    float fHi = 5000.f;
    float hpSlope = 2.f;
    float lpSlope = 2.f;
    float depth = 6.f;
    float sharpness = 1.f / 12.f;
    float threshold = 6.f;
    float harmonics = 0.f;
    float attack = 5.f;
    float release = 80.f;
    int quality = 1;
  };

  BlockState makeBlockState() const;
  void applyBlockState(const BlockState& s);
  void resetProcessing();
  void updateLatency();
  static int qualityToFft(int quality);

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  Dsp::SpectralTamer tamer_;
  double sampleRate_ = 44100.0;
  Steinberg::uint32 latencySamples_ = 0;
  /** Samples left to drain wet/OLA after input goes quiet before parking STFT. */
  int flushLeft_ = 0;
};

} // namespace Tamer
} // namespace calfNXT
