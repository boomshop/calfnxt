#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "pitch_correct.h"
#include "psola_shifter.h"
#include "viz_source.h"
#include "yin_detector.h"

#include "tuner_params.h"

#include <atomic>
#include <cstdint>
#include <cstring>
#include <mutex>

namespace calfNXT {
namespace Tuner {

class TunerPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  TunerPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new TunerPlugin);
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
  int takePitchHistory(float* out, int maxOut) override;
  const char* vizPitchId() const override { return "tuner"; }
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(TunerPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  static constexpr int kHistChannels = 5;
  static constexpr int kHistSlots = 512;
  static constexpr int kHistMinSlots = 48;
  static constexpr int kHistBufSize = kHistSlots * kHistChannels;
  static constexpr float kHistoryDisplayMs = 10000.f;

  struct BlockState
  {
    bool bypass = false;
    int source = 0; // 0=voice, 1=strings, 2=guitar
    float quality = 0.75f;
    float formant = 0.85f;
    float retuneMs = 80.f;
    float releaseMs = 120.f;
    float amount = 1.f;
    float thresholdCents = 10.f;
    float flexCents = 100.f;
    float vibrato = 0.75f;
    float settle = 0.4f;
    bool vibOn = false;
    float vibDelayMs = 100.f;
    float vibFadeMs = 200.f;
    float vibHz = 5.f;
    float octaveProtect = 0.88f;
    float unvoiced = 0.58f;
    int detect = 0;
    float fmin = 80.f;
    float fmax = 700.f;
    float refHz = 440.f;
    uint16_t noteMask = 0x0fff;
  };

  BlockState makeBlockState() const;
  void resetProcessing();
  void updateLatency(const BlockState& state, bool forceZero);
  int computeLatency(const BlockState& state) const;
  int detectDecimation() const;
  int yinWindow(const BlockState& state) const;
  void copyYinWindow(const BlockState& state, int latency);
  void histFeed(float inMidi, float tgtMidi, float conf, float flags, float corrCents);
  void publishHistSnapshot();

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;
  uint32_t latencySamples_ = 0;

  Dsp::LinkedPsola psola_;
  Dsp::YinDetector yin_;
  Dsp::PitchCorrector corrector_;

  float yinBuf_[Dsp::YinDetector::kMaxWin] {};
  int hopCount_ = 0;
  int hopSize_ = 256;
  float hopRatioFrom_ = 1.f;
  float hopRatioTo_ = 1.f;
  float hopPeriodFrom_ = 200.f;
  float hopPeriodTo_ = 200.f;
  float lastGoodPeriod_ = 0.f;
  int duckHops_ = 0;
  int leapHold_ = 0;
  int dryHops_ = 0;

  std::mutex histMutex_;
  float histBuf_[kHistBufSize] {};
  int histPos_ = 0;
  int histSampleCount_ = 0;
  int histSamplesPerSlot_ = 1;
  float histSnapshot_[kHistBufSize] {};
  int histSnapshotPos_ = 0;
  int histSnapshotSampleCount_ = 0;
  int histSnapshotSamplesPerSlot_ = 1;
  int histVisibleSlots_ = 160;
};

} // namespace Tuner
} // namespace calfNXT
