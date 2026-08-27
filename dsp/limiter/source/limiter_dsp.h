#pragma once

#include "delay_line.h"
#include "effect_base.h"
#include "gr_meter.h"
#include "io_stage.h"
#include "lookahead_limiter.h"
#include "resample_n.h"
#include "viz_source.h"

#include "limiter_params.h"

#include <atomic>
#include <cstdint>
#include <cstring>
#include <mutex>

namespace calfNXT {
namespace Limiter {

class LimiterPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  LimiterPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new LimiterPlugin);
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
  int takeEnvelopeDisplay(float* out, int maxOut) override;
  const char* vizDynamicsId() const override { return "limiter"; }
  const char* vizEnvelopeId() const override { return "limiter"; }
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(LimiterPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  static constexpr int kHistChannels = 2;
  static constexpr int kHistSlots = 512;
  static constexpr int kHistMinSlots = 48;
  static constexpr int kHistBufSize = kHistSlots * kHistChannels;

  /** Matches attack parameter max in limiter.plugin.json. */
  static constexpr float kMaxLookaheadMs = 10.f;
  static constexpr int kLatencyDelaySize = 8192;

  void resetProcessing();
  void applyParams(bool force);
  void updateLatency(bool forceZero = false);
  uint32_t latencyForLook(int lookLat, int os) const;
  uint32_t actualLatencySamples() const;
  uint32_t reportedLatencySamples() const;
  int oversamplingFactor() const;
  int effectiveOversampling() const;
  Dsp::LimitCurve curveFromPlain(float v) const;
  void histFeedSample(float audioPeakLin, float grLin);
  void publishHistSnapshot();
  static float applyColor(float x, float amount);

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;

  Dsp::LookaheadLimiter limiter_;
  Dsp::ResampleN resamplerL_;
  Dsp::ResampleN resamplerR_;
  /** Matched downsample of pre-GR taps for Diff Listen (same OS filters as wet). */
  Dsp::ResampleN cleanResamplerL_;
  Dsp::ResampleN cleanResamplerR_;
  Dsp::GrMeter grMeter_;

  float attackOld_ = -1.f;
  float limitOld_ = -1.f;
  bool ascOld_ = true;
  int oversamplingOld_ = -1;
  int curveOld_ = -1;

  Steinberg::uint32 latencySamples_ = 0;

  Dsp::StereoDelayXfade<kLatencyDelaySize> lookPad_;
  Dsp::StereoDelayXfade<kLatencyDelaySize> bypassDelay_;
  bool bypassOld_ = false;
  uint32_t bypassXfadePos_ = 0;
  uint32_t bypassXfadeLen_ = 0;
  /** Peak of last processed block — used so sleeping skip never cuts delay residual. */
  float lastOutPeak_ = 0.f;

  std::atomic<float> ascLed_ {0.f};

  float histBuf_[kHistBufSize] {};
  int histPos_ = 0;
  int histSampleCount_ = 0;
  int histSamplesPerSlot_ = 1;
  std::mutex histMutex_;
  float histSnapshot_[kHistBufSize] {};
  int histSnapshotPos_ = 0;
  int histSnapshotSampleCount_ = 0;
  int histSnapshotSamplesPerSlot_ = 1;
  int histVisibleSlots_ = 160;
};

} // namespace Limiter
} // namespace calfNXT
