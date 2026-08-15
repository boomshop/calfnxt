#pragma once

#include "compressor.h" // StereoLink
#include "effect_base.h"
#include "io_stage.h"
#include "sidechain_filter.h"
#include "transients.h"
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
  /** original, filtered, output, envelope, attack, release */
  static constexpr int kEnvChannels = 6;
  static constexpr int kEnvSlots = 512;
  static constexpr int kEnvMinSlots = 48;
  static constexpr int kEnvBufSize = kEnvSlots * kEnvChannels;

  struct BlockState
  {
    float mix = 1.f;
    float dry = 0.f;
    float softClip = 0.f;
    bool listen = false;
    bool delta = false;
    bool neutral = true;
    bool bypass = false;
    Dsp::StereoLink link = Dsp::StereoLink::Max;
  };

  void updateLatency(bool bypass, int lookaheadSamples);
  BlockState makeBlockState() const;
  void processSample(const BlockState& state, float& L, float& R);
  void processSilence(const BlockState& state, int nFrames);
  void resetProcessing();
  /** @p scale = mix*gain+(1-mix); used so Output history shows boost/cut under coarse slots. */
  void envBufFeedSample(float dryPeak, float filteredPeak, float wetPeak, float scale);
  void publishEnvSnapshot();
  void resetEnvSlotAccum(float dryPeak, float filteredPeak, float wetPeak, float scale,
                         float env, float att, float rel);

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;
  Steinberg::uint32 latencySamples_ = 0;
  Dsp::Transients transients_;
  Dsp::SidechainFilter sc_;

  float envBuf_[kEnvBufSize] {};
  int envPos_ = 0;
  int envSampleCount_ = 0;
  int envSamplesPerSlot_ = 1;
  // Per-slot accumulators (peak-hold alone hides attack boost on quieter rising samples).
  float envSlotMaxDry_ = 0.f;
  float envSlotMaxFilt_ = 0.f;
  float envSlotMaxWet_ = 0.f;
  float envSlotMaxBoost_ = 1.f;
  float envSlotMinCut_ = 1.f;
  float envSlotMaxEnv_ = 0.f;
  float envSlotMaxAtt_ = 0.f;
  float envSlotMaxRel_ = 0.f;
  std::mutex envMutex_;
  float envSnapshot_[kEnvBufSize] {};
  int envSnapshotPos_ = 0;
  int envSnapshotSampleCount_ = 0;
  int envSnapshotSamplesPerSlot_ = 1;
  int envVisibleSlots_ = 160;
};

} // namespace Transients
} // namespace calfNXT
