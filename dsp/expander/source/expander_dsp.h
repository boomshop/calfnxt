#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "expander.h"
#include "gr_meter.h"
#include "sidechain_filter.h"
#include "viz_source.h"

#include "expander_params.h"

#include <cstring>
#include <mutex>

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
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(ExpanderPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  static constexpr int kHistChannels = 3;
  static constexpr int kHistSlots = 512;
  static constexpr int kHistMinSlots = 48;
  static constexpr int kHistBufSize = kHistSlots * kHistChannels;

  struct BlockState
  {
    bool bypass = false;
    bool listen = false;
    bool sidechainActive = false;
    Dsp::StereoLink link = Dsp::StereoLink::Max;
  };

  BlockState makeBlockState() const;
  void processSample(const BlockState& state, float& L, float& R, float scL, float scR);
  void resetProcessing();
  void histFeedSample(float audioPeakLin, float detPeakLin, float grLin);
  void publishHistSnapshot();

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;
  Dsp::GainExpansion gx_;
  Dsp::SidechainFilter sc_;
  Dsp::GrMeter grMeter_;
  std::mutex vizMutex_;
  float pointInDb_ = -96.f;
  float pointOutDb_ = -96.f;

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

} // namespace Expander
} // namespace calfNXT
