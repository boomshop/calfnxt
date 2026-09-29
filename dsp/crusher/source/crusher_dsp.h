#pragma once

#include "bitreduction.h"
#include "channel_mode.h"
#include "effect_base.h"
#include "io_stage.h"
#include "sample64_scratch.h"
#include "viz_history_ring.h"
#include "viz_source.h"

#include "crusher_params.h"

namespace calfNXT {
namespace Crusher {

/** Density bins along crush input x ∈ [−1, 1] (plus zone at index 0). */
inline constexpr int kShapeHistBins = 48;

class CrusherPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  CrusherPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new CrusherPlugin);
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
  int takeShapePoint(float* out, int maxOut) override;
  const char* vizShapeId() const override { return "crusher"; }
  int takeEnvelopeDisplay(float* out, int maxOut) override;
  const char* vizEnvelopeId() const override { return "crusher"; }
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(CrusherPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  struct BlockState
  {
    bool bypass = false;
    int mode = 0;
    Dsp::ChannelMode channel = Dsp::ChannelMode::Stereo;
    float bits = 4.f;
    float morph = 0.5f;
    float dcLin = 1.f;
    float aa = 0.5f;
  };

  // History: abs peaks [inL, outL, inR, outR] (max-within-slot + boost/cut warp).
  static constexpr int kHistChannels = 4;

  BlockState makeBlockState() const;
  void resetProcessing();
  void applyCrushParams(const BlockState& s);
  void observeSend(float sendL, float sendR);
  void histFeedSample(float inL, float outL, float inR, float outR);
  void histResetSlotScale(float inL, float outL, float inR, float outR);
  void publishHistSnapshot();
  void processFloat(float* left, float* right, Steinberg::int32 nFrames, const BlockState& state);

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  Dsp::Sample64Scratch scratch64_;
  double sampleRate_ = 44100.0;
  Dsp::BitReduction bit_;

  float shapeZone_ = 0.f;
  float shapeZoneFall_ = 0.999f;
  float histAcc_[kShapeHistBins] {};
  float histDisp_[kShapeHistBins] {};

  Dsp::VizHistoryRing<kHistChannels> hist_;
  // Per-slot out/in ratios so soft crush tips show when peak(|out|)≈peak(|in|).
  float histMaxBoostL_ = 1.f;
  float histMinCutL_ = 1.f;
  float histMaxBoostR_ = 1.f;
  float histMinCutR_ = 1.f;
};

} // namespace Crusher
} // namespace calfNXT
