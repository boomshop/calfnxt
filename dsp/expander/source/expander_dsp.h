#pragma once

#include "effect_base.h"
#include "channel_mode.h"
#include "expander.h"
#include "gain_util.h"
#include "gr_meter.h"
#include "io_stage.h"
#include "sidechain_filter.h"
#include "viz_source.h"

#include "expander_params.h"

#include <atomic>
#include <cstring>

namespace calfNXT {
namespace Expander {

class ExpanderPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  ExpanderPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new ExpanderPlugin);
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
  int takeGainReductionDb(float* out, int maxOut) override;
  int takeDynamicsPoint(float* out, int maxOut) override;
  const char* vizDynamicsId() const override { return "exp"; }
  int takeEnvelopeDisplay(float* out, int maxOut) override;
  const char* vizEnvelopeId() const override { return "exp"; }
  /** Inhibit 1/2 hold amount 0…1 (tab warn / activity). */
  int takeLfoActivity(float* out, int maxOut) override;
  const char* vizLfoActivityId() const override { return "exp"; }
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(ExpanderPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  static constexpr int kInhibitCount = 2;
  static constexpr int kHistChannels = 4; // audio, det, gr, inhibit
  static constexpr int kHistSlots = 512;
  static constexpr int kHistMinSlots = 48;
  static constexpr int kHistBufSize = kHistSlots * kHistChannels;

  /**
   * Inhibit envelope on a 0…1 desire (relative main-vs-inv), not absolute peak.
   * Instant attack to desire, hold after desire falls, then release.
   */
  struct InhibitEnv
  {
    float env = 0.f;
    int holdLeft = 0;

    void reset()
    {
      env = 0.f;
      holdLeft = 0;
    }

    float processDesire(float desire, float holdMs, float releaseMs, float sampleRate)
    {
      desire = std::clamp(desire, 0.f, 1.f);
      const int holdSamples =
        static_cast<int>(std::max(0.f, holdMs) * sampleRate * 0.001f + 0.5f);
      const float releaseMsClamped = std::max(1.f, releaseMs);
      const float relCoeff =
        1.f - std::exp(-1.f / (releaseMsClamped * 0.001f * sampleRate));

      if (desire > 1.0e-3f)
      {
        if (desire >= env)
          env = desire;
        holdLeft = holdSamples;
      }
      else if (holdLeft > 0)
      {
        --holdLeft;
      }
      else if (env > 0.f)
      {
        env += (0.f - env) * relCoeff;
        if (env < 1.0e-4f)
          env = 0.f;
      }
      return env;
    }
  };

  struct BlockState
  {
    bool bypass = false;
    bool listen = false;
    bool sidechainActive = false;
    bool invActive[kInhibitCount] {};
    bool invListen[kInhibitCount] {};
    float invGainLin[kInhibitCount] {1.f, 1.f};
    float invThreshDb[kInhibitCount] {-24.f, -24.f};
    float invHoldMs[kInhibitCount] {};
    float invReleaseMs[kInhibitCount] {120.f, 120.f};
    Dsp::StereoLink link = Dsp::StereoLink::Max;
    Dsp::ChannelMode channel = Dsp::ChannelMode::Stereo;
  };

  BlockState makeBlockState() const;
  void processSample(const BlockState& state, float& L, float& R, float scL, float scR,
                     float inv1L, float inv1R, float inv2L, float inv2R);
  void resetProcessing();
  void histFeedSample(float audioPeakLin, float detPeakLin, float grLin,
                      float inhibitLin);
  void publishHistSnapshot();
  void publishDynamicsPoint();

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;
  Dsp::GainExpansion gx_;
  Dsp::SidechainFilter sc_;
  Dsp::SidechainFilter invSc_[kInhibitCount];
  InhibitEnv invEnv_[kInhibitCount];
  float invAmount_[kInhibitCount] {};
  Dsp::GrMeter grMeter_;
  /* Operating point: plains per sample, atomics once per process(). */
  float pointInDbPlain_ = -96.f;
  float pointOutDbPlain_ = -96.f;
  std::atomic<float> pointInDb_ {-96.f};
  std::atomic<float> pointOutDb_ {-96.f};

  float histBuf_[kHistBufSize] {};
  int histPos_ = 0;
  int histSampleCount_ = 0;
  int histSamplesPerSlot_ = 1;
  /* Snapshot published once per block from the audio thread, read on the UI
   * poll. Seqlock (odd/even sequence) — the audio thread never blocks; the
   * reader retries on a torn read. */
  std::atomic<uint32_t> histSeq_ {0};
  float histSnapshot_[kHistBufSize] {};
  int histSnapshotPos_ = 0;
  int histSnapshotSampleCount_ = 0;
  int histSnapshotSamplesPerSlot_ = 1;
  int histVisibleSlots_ = 160;
  /** 1 = fully active, 0 = fully bypassed (soft crossfade). */
  float bypassSmooth_ = 1.f;
};

} // namespace Expander
} // namespace calfNXT
