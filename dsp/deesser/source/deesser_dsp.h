#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "band_splitter.h"
#include "channel_mode.h"
#include "compressor.h"
#include "deesser_detector.h"
#include "gr_meter.h"
#include "viz_history_ring.h"
#include "viz_source.h"

#include "deesser_params.h"

#include <atomic>
#include <cstring>

namespace calfNXT {
namespace Deesser {

class DeesserPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  DeesserPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new DeesserPlugin);
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
  const char* vizDynamicsId() const override { return "deess"; }
  int takeEnvelopeDisplay(float* out, int maxOut) override;
  const char* vizEnvelopeId() const override { return "deess"; }
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(DeesserPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  // History: trigger, GR, post-GR sum (no makeup), threshold, pre-GR sum.
  static constexpr int kHistChannels = 5;
  static constexpr float kHistoryDisplayMs = 10000.f;
  static constexpr float kFixedKneeDb = 9.f;

  struct BlockState
  {
    float makeupLin = 1.f;
    bool bypass = false;
    bool listen = false;
    bool split = false;
    /** Rumble target: detector LP + Split reduces the low band. */
    bool rumble = false;
    Dsp::ChannelMode channel = Dsp::ChannelMode::Stereo;
  };

  BlockState makeBlockState() const;
  void processSample(const BlockState& state, float& L, float& R);
  void resetProcessing();
  void histFeedSample(float triggerLin, float grLin, float outPeakLin,
                      float threshLin, float prePeakLin);
  void publishHistSnapshot();

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;

  Dsp::GainReduction gr_;
  Dsp::DeesserDetector detector_;
  Dsp::BandSplitter splitL_;
  Dsp::BandSplitter splitR_;
  Dsp::GrMeter grMeter_;

  Dsp::VizHistoryRing<kHistChannels> hist_;
  /** 1 = fully active, 0 = fully bypassed (soft crossfade). */
  float bypassSmooth_ = 1.f;
};

} // namespace Deesser
} // namespace calfNXT
