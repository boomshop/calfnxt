#pragma once

#include "delay_line.h"
#include "effect_base.h"
#include "peak_hold.h"
#include "sidechain_filter.h"
#include "viz_source.h"

#include "aligner_params.h"

#include <atomic>

namespace calfNXT {
namespace Aligner {

class AlignerPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  static constexpr int kLanes = 8;
  /** Stereo aux Reference bus index (after the single N-channel main). */
  static constexpr int kRefBus = 1;
  static constexpr float kMaxLaneMs = 50.f;
  static constexpr float kMaxMasterMs = 50.f;

  AlignerPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new AlignerPlugin);
  }

  Steinberg::tresult PLUGIN_API initialize(Steinberg::FUnknown* context) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setActive(Steinberg::TBool state) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setupProcessing(Steinberg::Vst::ProcessSetup& setup) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API process(Steinberg::Vst::ProcessData& data) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setState(Steinberg::IBStream* state) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API getState(Steinberg::IBStream* state) SMTG_OVERRIDE;
  Steinberg::uint32 PLUGIN_API getLatencySamples() SMTG_OVERRIDE;

  Ui::IVizSource* vizSource() override { return this; }
  int takeInputLevelsDb(float* out, int maxOut) override;
  int takeOutputLevelsDb(float* out, int maxOut) override;
  int takeEnvelopeDisplay(float* out, int maxOut) override;
  const char* vizEnvelopeId() const override { return "aligner"; }
  const char* vizEnvelopeKind() const override { return "ctrl"; }

  /**
   * Hit waveforms:
   * [bins, nLanes, preBins, viewPreMs, viewPostMs,
   *  lane0…lane7, mixL, mixR, refL, refR].
   */
  int takeIrWaveform(float* out, int maxOut) override;
  const char* vizIrWaveId() const override { return "aligner"; }

  OBJ_METHODS(AlignerPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  static constexpr int kDelaySize = 32768;
  static constexpr int kWaveExtra = 4; // mixL, mixR, refL, refR

  struct LaneState
  {
    bool mute = false;
    bool solo = false;
    bool phase = false;
    bool join = false;
    float delayMs = 0.f;
    float gainLin = 1.f;
    float pan = 0.f;
  };

  void updateLatency(Steinberg::uint32 want, bool notifyHost);
  int groupRoot(int lane) const;
  float effectiveLaneDelayMs(int lane) const;
  void makeDelayPlan(float trimMs, float& lanePadMs, float& masterMs, float& masterDelayMs,
                     float& reportMs) const;
  int msToDelaySamples(float ms) const;
  void writeLaneDelayPlain(int lane, float plainMs);
  void syncJoinPrevFromParams();
  void captureHitWave(int anchor);
  void tickHitWaveTrigger(int anchor, float anchorSample, bool anchorActive);

  float params_[kParamCount] {};
  LaneState lanes_[kLanes] {};
  /** Previous Join for abs↔rel delay conversion on edge. */
  bool joinPrev_[kLanes] {};

  Dsp::DelayLine<kDelaySize> laneDelay_[kLanes];
  Dsp::DelayLine<kDelaySize> analysisDelay_[kLanes];
  Dsp::DelayLine<kDelaySize> mixFiltDelay_[2];
  Dsp::DelayLine<kDelaySize> mixRawDelay_[2];
  Dsp::DelayLine<kDelaySize> refFiltDelay_[2];
  Dsp::DelayLine<kDelaySize> refRawDelay_[2];
  Dsp::StereoDelayXfade<kDelaySize> masterDelay_;
  Dsp::SidechainFilter analysis_[kLanes];
  Dsp::SidechainFilter analysisRef_[2];
  bool filterWaves_ = true;

  Viz::LevelPeakHold peakIn_{kLanes};
  Viz::LevelPeakHold peakOut_{2};

  double sampleRate_ = 48000.0;
  Steinberg::uint32 latencySamples_ = 0;
  int maxPadSamples_ = 0;

  float corrNum_[kLanes] {};
  float corrEa_[kLanes] {};
  float corrEb_[kLanes] {};
  float corrSmooth_[kLanes] {};

  static constexpr int kWaveBins = 1024;
  static constexpr float kWaveSpanMsDefault = 32.f;
  static constexpr float kWaveSpanMsMin = 24.f;
  static constexpr float kWaveSpanMsMax = 240.f;
  static constexpr float kWavePadMs = 50.f;
  static constexpr int kWaveRawMax = 32768;
  float waveRaw_[kLanes][kWaveRawMax] {};
  float waveRawMix_[2][kWaveRawMax] {};
  float waveRawRef_[2][kWaveRawMax] {};
  int waveRawLen_ = 0;
  int wavePeakIndex_ = 0;
  int waveViewPre_ = 0;
  int waveViewPost_ = 0;
  float waveViewPreMs_ = 8.f;
  float waveViewPostMs_ = 24.f;
  bool waveHave_ = false;
  int wavePending_ = 0;
  int waveCooldown_ = 0;
  float waveEnv_ = 0.f;
  float wavePrevA_ = 0.f;
  float wavePrev2A_ = 0.f;
  bool bypassPrev_ = false;

  std::atomic<float> vizCorr_[kLanes] {};
  std::atomic<float> vizMaxLag_ {0.f};
  std::atomic<float> vizLatencyMs_ {0.f};
};

} // namespace Aligner
} // namespace calfNXT
