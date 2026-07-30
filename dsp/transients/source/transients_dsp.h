#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "transients.h"
#include "sidechain_filter.h"
#include "viz_source.h"

#include "transients_params.h"

#include <cstring>
#include <mutex>

namespace calfNXT {
namespace Transients {

class TransientsPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  TransientsPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new TransientsPlugin);
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
  int takeEnvelopeDisplay(float* out, int maxOut) override;
  const char* vizEnvelopeId() const override { return "env"; }
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(TransientsPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  // 5 values per display slot: input peak, output peak, envelope, attack, release
  static constexpr int kEnvChannels = 5;
  static constexpr int kEnvSlots = 256;
  static constexpr int kEnvMinSlots = 48;
  static constexpr int kEnvBufSize = kEnvSlots * kEnvChannels;

  struct BlockState
  {
    float mix = 1.f;
    float dry = 0.f;
    bool listen = false;
    bool neutral = true;
    bool bypass = false;
  };

  void updateLatency(bool bypass, int lookaheadSamples);
  BlockState makeBlockState() const;
  void processSample(const BlockState& state, float& L, float& R);
  void processSilence(const BlockState& state, int nFrames);
  void resetProcessing();
  void envBufFeedSample(float inPeak, float outPeak);
  void publishEnvSnapshot();

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;
  Steinberg::uint32 latencySamples_ = 0;
  Dsp::Transients transients_;
  Dsp::SidechainFilter sc_;

  // Envelope display ring buffer (written in process, snapshot for UI)
  float envBuf_[kEnvBufSize] {};
  int envPos_ = 0;
  int envSampleCount_ = 0;
  int envSamplesPerSlot_ = 1;
  std::mutex envMutex_;
  float envSnapshot_[kEnvBufSize] {};
  int envSnapshotPos_ = 0;
  int envSnapshotSampleCount_ = 0;
  int envSnapshotSamplesPerSlot_ = 1;
  int envVisibleSlots_ = 160;
};

} // namespace Transients
} // namespace calfNXT
