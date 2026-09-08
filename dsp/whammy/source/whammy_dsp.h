#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "viz_source.h"
#include "whammy_shifter.h"

#include "whammy_params.h"

namespace calfNXT {
namespace Whammy {

class WhammyPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  WhammyPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new WhammyPlugin);
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

  OBJ_METHODS(WhammyPlugin, Plugin::EffectBase)
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
    int quality = 2;
    float pitch = 0.f;
    float mix = 1.f;
    float glideMs = 8.f;
    float tone = 0.8f;
  };

  BlockState makeBlockState() const;
  void resetProcessing();
  int grainSamples(int quality) const;
  void applyQuality(int quality);
  void updateLatency(bool forceZero);
  void quantizePitchParam();

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  Dsp::WhammyShifter shifter_;
  double sampleRate_ = 44100.0;
  float pitchSm_ = 0.f;
  int quality_ = -1;
  Steinberg::uint32 latencySamples_ = 0;
};

} // namespace Whammy
} // namespace calfNXT
