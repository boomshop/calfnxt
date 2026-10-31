#pragma once

#include "delay_line.h"
#include "effect_base.h"
#include "peak_hold.h"
#include "sidechain_filter.h"
#include "viz_source.h"

#include "aligner_params.h"

#include <atomic>
#include <cstdint>

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
   * Hit waveforms (change-gated — 0 when the packed view is unchanged):
   * [bins, nLanes, preBins, viewPreMs, viewPostMs,
   *  lane0…lane7, mixL, mixR, refL, refR].
   * Lock from half-period |peaks| (ZC→ZC): first rise after armed/wait-rise,
   * track max while rising, wait after a fall. Re-lock blocked for ~½ Wave
   * span so a wide window can show two hits without jumping. Viz publishes
   * once the current Wave window is full (previous pack stays until then).
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

  /** Max-span view/pad/win geometry (Wave knob only crops the viz pack). */
  void waveGeomForSpan(float spanMs, int& viewPre, int& viewPost, int& pad, int& win) const;
  void resetWaveHit();
  /** Lock with the attack sample `peakAge` samples in the past (1 = now). */
  void armWaveLock(int peakAge);
  /** Copy ring → waveRaw_; peak at pad+pre, `peakAge` = samples since that max.
   *  When `publish`, bump fillSeq so the UI may take a new pack. */
  void snapshotWaveFromRing(int peakAge, bool publish);
  /** Hump state-machine lock + live post fill (hit tap, per sample). */
  void tickWaveHit(float sample, bool active);

  /** Inputs that change the packed viz crop / delay alignment / fill step. */
  struct WaveVizSig
  {
    Steinberg::uint32 gen = 0;
    Steinberg::uint32 fillSeq = 0;
    float spanMs = 0.f;
    float masterTrimMs = 0.f;
    float laneDelayMs[kLanes] {};
    std::uint8_t phase[kLanes] {};
    std::uint8_t bypass = 0;
    std::uint8_t anchor = 0;
  };
  void fillWaveVizSig(WaveVizSig& sig) const;

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
  /** Abs floor for a countable half-period peak. */
  static constexpr float kWaveOnsetFloor = 0.02f;
  /** Re-trigger mute ≈ this fraction of the Wave knob span. */
  static constexpr float kWaveRefractorySpan = 0.5f;
  /** Silent raw extend while filling past the first published Wave window. */
  static constexpr int kWaveFillRawStride = 64;

  enum class WaveHitPhase : std::uint8_t
  {
    Armed = 0,    // ready for first half-period peak
    InHit = 1,    // locked; remember max while period peaks rise
    WaitRise = 2, // saw a fall; next rise (after a ZC) locks
  };

  float waveRaw_[kLanes][kWaveRawMax] {};
  float waveRawMix_[2][kWaveRawMax] {};
  float waveRawRef_[2][kWaveRawMax] {};
  int waveRawLen_ = 0;
  int wavePeakIndex_ = 0;
  int waveCapPre_ = 0;
  int waveCapPost_ = 0;
  int wavePostTail_ = 0;
  /** Age of the locked attack; grows with wall-clock while filling. */
  int wavePeakAge_ = 1;
  bool waveFilling_ = false;
  /** True until the current Wave post window has been published once. */
  bool wavePendingViz_ = false;
  bool waveHave_ = false;
  Steinberg::uint32 waveCapGen_ = 0;
  Steinberg::uint32 waveFillSeq_ = 0;
  WaveVizSig waveVizSent_ {};
  bool waveVizHaveSent_ = false;

  // Half-period (ZC) peak state machine → x=0.
  WaveHitPhase waveHitPhase_ = WaveHitPhase::Armed;
  float waveHitMax_ = 0.f;
  float waveLastHump_ = 0.f;
  float waveHitPrev_ = 0.f;
  float wavePeriodPeak_ = 0.f;
  int wavePeriodPeakAge_ = 1;
  int waveRefractoryLeft_ = 0;

  bool bypassPrev_ = false;

  std::atomic<float> vizCorr_[kLanes] {};
  std::atomic<float> vizMaxLag_ {0.f};
  std::atomic<float> vizLatencyMs_ {0.f};
};

} // namespace Aligner
} // namespace calfNXT
