#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "sample64_scratch.h"
#include "spectral_denoiser.h"
#include "viz_source.h"

#include "denoiser_params.h"

#include <mutex>
#include <string>
#include <vector>

namespace calfNXT {
namespace Denoiser {

class DenoiserPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  DenoiserPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new DenoiserPlugin);
  }

  Steinberg::tresult PLUGIN_API initialize(Steinberg::FUnknown* context) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setBusArrangements(
      Steinberg::Vst::SpeakerArrangement* inputs, Steinberg::int32 numIns,
      Steinberg::Vst::SpeakerArrangement* outputs, Steinberg::int32 numOuts) SMTG_OVERRIDE;
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
  int takeOutputSpectrum(float* out, int maxOut) override;
  const char* vizOutputSpectrumId() const override { return "denoiser_prof"; }
  int vizExtraSpectrumCount() const override { return Dsp::SpectralDenoiser::kNumProfiles; }
  const char* vizExtraSpectrumId(int index) const override;
  int takeExtraSpectrum(int index, float* out, int maxOut) override;
  int takeFreqResponse(float* out, int maxOut) override;
  const char* vizFreqResponseId() const override { return "denoiser"; }
  void configureVizBins(const char* id, int bins) override;
  bool handleIrCommand(const char* json) override;
  bool takeIrUiJson(std::string& out) override;

  OBJ_METHODS(DenoiserPlugin, Plugin::EffectBase)
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
    int profile = 1; // 1…3
    float blendMs = 250.f;
    float amount = 1.f;
    float floor = -20.f;
    float fLo = 20.f;
    float fHi = 160.f;
    int loSlope = 2;
    int hiSlope = 2;
    int quality = 1;
    int listen = 0; // 0 = off, 1…3 = profile listen
    bool mono = false;
    float spanDb = 12.f;
    float offsetDb = 0.f;
    bool rms = false;
  };

  BlockState makeBlockState() const;
  void applyBlockState(const BlockState& s);
  void resetProcessing();
  void updateLatency();
  void pushProfilesUiJson();
  static int qualityToFft(int quality);
  static int parseSlot(const char* json);

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  Dsp::Sample64Scratch scratch64_;
  Dsp::SpectralDenoiser denoiser_;
  double sampleRate_ = 44100.0;
  Steinberg::uint32 latencySamples_ = 0;

  std::mutex uiMutex_;
  std::string pendingUiJson_;
};

} // namespace Denoiser
} // namespace calfNXT
