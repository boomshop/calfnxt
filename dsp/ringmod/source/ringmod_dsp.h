#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "simple_lfo.h"
#include "viz_source.h"

#include "ringmod_params.h"

#include <atomic>

namespace calfNXT {
namespace Ringmod {

class RingmodPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  RingmodPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new RingmodPlugin);
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
  int takeLfoActivity(float* out, int maxOut) override;
  const char* vizLfoActivityId() const override { return "lfo"; }
  int takeRingmodEffective(float* out, int maxOut) override;
  const char* vizRingmodEffectiveId() const override { return "ringmod"; }

  OBJ_METHODS(RingmodPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  struct BlockState
  {
    bool bypass = false;
    bool listen = false;
    bool lfo1FreqActive = false;
    bool lfo1DetuneActive = false;
    bool lfo2Lfo1Active = false;
    bool lfo2AmountActive = false;
    int modMode = 0;
    int lfo1Mode = 0;
    int lfo2Mode = 0;
    float modFreq = 1000.f;
    float modAmount = 0.5f;
    float modPhase = 0.5f;
    float modDetune = 0.f;
    float lfo1Freq = 0.1f;
    float lfo2Freq = 0.2f;
    float lfo1FreqLo = 100.f;
    float lfo1FreqHi = 10000.f;
    float lfo1DetuneLo = -100.f;
    float lfo1DetuneHi = 100.f;
    float lfo2Lfo1Lo = 0.05f;
    float lfo2Lfo1Hi = 0.5f;
    float lfo2AmountLo = 0.3f;
    float lfo2AmountHi = 0.6f;
  };

  BlockState makeBlockState() const;
  void resetProcessing();
  void applyBaseOscParams(const BlockState& s);
  void handleResets();

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;

  Dsp::SimpleLfo modL_;
  Dsp::SimpleLfo modR_;
  Dsp::SimpleLfo lfo1_;
  Dsp::SimpleLfo lfo2_;

  bool lfo1ResetArmed_ = false;
  bool lfo2ResetArmed_ = false;

  std::atomic<float> lfo1Activity_{0.f};
  std::atomic<float> lfo2Activity_{0.f};
  std::atomic<float> effModFreq_{1000.f};
  std::atomic<float> effModDetune_{0.f};
  std::atomic<float> effModAmount_{0.5f};
  std::atomic<float> effLfo1Freq_{0.1f};
};

} // namespace Ringmod
} // namespace calfNXT
