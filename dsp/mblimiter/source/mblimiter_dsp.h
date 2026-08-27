#pragma once

#include "band_splitter.h"
#include "delay_line.h"
#include "effect_base.h"
#include "gr_meter.h"
#include "io_stage.h"
#include "lookahead_limiter.h"
#include "peak_hold.h"
#include "resample_n.h"
#include "viz_source.h"

#include "mblimiter_params.h"

#include <atomic>
#include <cstdint>
#include <cstring>
#include <mutex>
#include <vector>

namespace calfNXT {
namespace Mblimiter {

class MblimiterPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  static constexpr int kMaxBands = 6;

  MblimiterPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new MblimiterPlugin);
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
  int takeGainReductionDb(float* out, int maxOut) override;
  int takeBandGainsDb(float* out, int maxOut) override;
  int takeBandIoLevelsDb(float* out, int maxOut) override;
  int takeEnvelopeDisplay(float* out, int maxOut) override;
  const char* vizDynamicsId() const override { return "mblimiter"; }
  const char* vizEnvelopeId() const override { return "mblimiter"; }
  const char* vizBandIoLevelsId() const override { return "mblimiter"; }
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(MblimiterPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  static constexpr int kHistChannels = 3; // full / band / grLin
  static constexpr int kHistSlots = 512;
  static constexpr int kHistMinSlots = 48;
  static constexpr int kHistBufSize = kHistSlots * kHistChannels;

  /** Matches attack parameter max in mblimiter.plugin.json. */
  static constexpr float kMaxLookaheadMs = 10.f;
  /** Host-rate delay capacity for bypass / look pad (covers 2×10 ms @ 192 kHz + OS). */
  static constexpr int kLatencyDelaySize = 8192;

  void resetProcessing();
  void applyParams(bool force);
  /** Report host latency. forceZero only when deactivated. */
  void updateLatency(bool forceZero = false);
  uint32_t latencyForLooks(int stripLat, int bbLat, int os) const;
  uint32_t actualLatencySamples() const;
  uint32_t reportedLatencySamples() const;
  void applySplitParams();
  int numBands() const;
  int oversamplingFactor() const;
  int effectiveOversampling() const;
  Dsp::LimitCurve curveFromPlain(float v) const;
  static float weightFromPlain(float w);
  static float stripReleaseMs(float masterMs, float relCoeff);
  /** Calf min-release floor: 2.5 periods of the band's lowest edge (ms). */
  float stripReleaseWithMinMs(int band, float masterMs, float relCoeff) const;
  static float applyColor(float x, float amount);
  void histFeedSample(int band, float fullPeak, float bandPeak, float grLin);
  void publishHistSnapshot();
  void ensureMultiBuffer();
  /** Light denormal scrub for OS filters when all limiters are sleeping. */
  void idleSanitize(int nFrames);

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;

  Dsp::BandSplitter splitL_;
  Dsp::BandSplitter splitR_;
  Dsp::LookaheadLimiter strip_[kMaxBands];
  Dsp::LookaheadLimiter broadband_;
  Dsp::ResampleN resamplerL_[kMaxBands];
  Dsp::ResampleN resamplerR_[kMaxBands];
  Dsp::ResampleN bbResamplerL_;
  Dsp::ResampleN bbResamplerR_;
  Dsp::ResampleN cleanResamplerL_;
  Dsp::ResampleN cleanResamplerR_;
  Dsp::GrMeter stripMeter_[kMaxBands];
  Dsp::GrMeter bbMeter_;
  /** Deepest strip×broadband GR with its own fall ballistics (UI Attenuation). */
  Dsp::GrMeter overallMeter_;
  Viz::LevelPeakHold bandInHold_[kMaxBands];
  Viz::LevelPeakHold bandOutHold_[kMaxBands];

  std::vector<float> multiBuf_;
  float weightLin_[kMaxBands] {};
  float lastGrDb_[kMaxBands] {};

  float attackOld_ = -1.f;
  float limitOld_ = -1.f;
  float releaseOld_ = -1.f;
  float marginOld_ = -1.f;
  float kneeOld_ = -1.f;
  float holdMsOld_ = -1.f;
  float emphasisOld_ = -1.f;
  float ascCoeffPlainOld_ = -1.f;
  float weightPlainOld_[kMaxBands] {};
  float relCoeffOld_[kMaxBands] {};
  float xoverOld_[kMaxBands - 1] {};
  bool ascOld_ = true;
  bool minReleaseOld_ = false;
  bool truePeakOld_ = false;
  int oversamplingOld_ = -1;
  int curveOld_ = -1;
  int numBandsOld_ = -1;
  int slopeOld_ = -1;

  Steinberg::uint32 latencySamples_ = 0;

  /** Pads wet path so total delay stays at reported (max) look latency. */
  Dsp::StereoDelayXfade<kLatencyDelaySize> lookPad_;
  /** Dry path delayed by reported latency for click-free bypass. */
  Dsp::StereoDelayXfade<kLatencyDelaySize> bypassDelay_;
  bool bypassOld_ = false;
  uint32_t bypassXfadePos_ = 0;
  uint32_t bypassXfadeLen_ = 0;
  /** Peak of last processed block — sleeping skip must not cut delay residual. */
  float lastOutPeak_ = 0.f;

  std::atomic<float> ascLed_ {0.f};

  float histBuf_[kMaxBands][kHistBufSize] {};
  int histPos_[kMaxBands] {};
  int histSampleCount_[kMaxBands] {};
  int histSamplesPerSlot_ = 1;
  std::mutex histMutex_;
  float histSnapshot_[kMaxBands][kHistBufSize] {};
  int histSnapshotPos_[kMaxBands] {};
  int histSnapshotSampleCount_[kMaxBands] {};
  int histSnapshotSamplesPerSlot_ = 1;
  int histVisibleSlots_ = 160;
};

} // namespace Mblimiter
} // namespace calfNXT
