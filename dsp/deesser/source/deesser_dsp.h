#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "band_splitter.h"
#include "compressor.h"
#include "deesser_detector.h"
#include "gr_meter.h"
#include "viz_source.h"

#include "deesser_params.h"

#include <cstring>
#include <mutex>

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
  // History: input peak, detector peak, GR (lin) + trailing phase.
  static constexpr int kHistChannels = 3;
  static constexpr int kHistSlots = 256;
  static constexpr int kHistMinSlots = 48;
  static constexpr int kHistBufSize = kHistSlots * kHistChannels;
  static constexpr float kHistoryDisplayMs = 10000.f;
  static constexpr float kFixedKneeDb = 9.f;

  struct BlockState
  {
    float makeupLin = 1.f;
    bool bypass = false;
    bool listen = false;
    bool split = false;
  };

  BlockState makeBlockState() const;
  void processSample(const BlockState& state, float& L, float& R);
  void resetProcessing();
  void histFeedSample(float audioPeakLin, float detPeakLin, float grLin);
  void publishHistSnapshot();

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;

  Dsp::GainReduction gr_;
  Dsp::DeesserDetector detector_;
  Dsp::BandSplitter splitL_;
  Dsp::BandSplitter splitR_;
  Dsp::GrMeter grMeter_;

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

} // namespace Deesser
} // namespace calfNXT
