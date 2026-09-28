#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "channel_mode.h"
#include "compressor.h"
#include "gr_meter.h"
#include "sidechain_filter.h"
#include "viz_history_ring.h"
#include "viz_source.h"

#include "compressor_params.h"

#include <atomic>
#include <cstring>

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
  // History: trigger (SC/detector), GR (lin), post-GR peak (no makeup/mix), threshold.
  static constexpr int kHistChannels = 4;

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
  void histFeedSample(float triggerLin, float grLin, float outPeakLin,
                      float threshLin);
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

  Dsp::VizHistoryRing<kHistChannels> hist_;
  /** 1 = fully active, 0 = fully bypassed (soft crossfade). */
  float bypassSmooth_ = 1.f;
};

} // namespace Compressor
} // namespace calfNXT
