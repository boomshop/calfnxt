#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "channel_mode.h"
#include "compressor.h"
#include "gr_meter.h"
#include "sidechain_filter.h"
#include "viz_source.h"

#include "compressor_params.h"

#include <atomic>
#include <cstring>
#include <mutex>

namespace calfNXT {
namespace Compressor {

class CompressorPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  CompressorPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new CompressorPlugin);
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
  const char* vizDynamicsId() const override { return "comp"; }
  int takeEnvelopeDisplay(float* out, int maxOut) override;
  const char* vizEnvelopeId() const override { return "comp"; }
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(CompressorPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  // History: audio peak, sidechain/detector peak, GR (lin) — same layout as DeEsser.
  static constexpr int kHistChannels = 3;
  static constexpr int kHistSlots = 512;
  static constexpr int kHistMinSlots = 48;
  static constexpr int kHistBufSize = kHistSlots * kHistChannels;

  struct BlockState
  {
    float mix = 1.f;
    float dry = 0.f;
    float makeupLin = 1.f;
    float makeupDb = 0.f;
    bool bypass = false;
    bool listen = false;
    bool sidechainActive = false;
    Dsp::StereoLink link = Dsp::StereoLink::Max;
    Dsp::ChannelMode channel = Dsp::ChannelMode::Stereo;
  };

  BlockState makeBlockState() const;
  void processSample(const BlockState& state, float& L, float& R, float scL, float scR);
  void resetProcessing();
  void histFeedSample(float audioPeakLin, float detPeakLin, float grLin);
  void publishHistSnapshot();
  void publishDynamicsPoint();

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;
  Dsp::GainReduction gr_;
  Dsp::SidechainFilter sc_;
  Dsp::GrMeter grMeter_;
  /* Operating point: audio thread writes plains per sample, publishes to
   * atomics once per process() for the UI poll — never takes a mutex. */
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
};

} // namespace Compressor
} // namespace calfNXT
