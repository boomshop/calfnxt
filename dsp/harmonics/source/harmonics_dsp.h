#pragma once

#include "biquad.h"
#include "complementary_band_filter.h"
#include "effect_base.h"
#include "io_stage.h"
#include "tap_distortion.h"
#include "viz_source.h"

#include "harmonics_params.h"

#include <cstring>

namespace calfNXT {
namespace Harmonics {

/** Density bins along waveshaper input x ∈ [−1, 1] (plus zone at index 0). */
inline constexpr int kShapeHistBins = 48;

class HarmonicsPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  HarmonicsPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new HarmonicsPlugin);
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
  const char* vizShapeId() const override { return "harmonics"; }

  OBJ_METHODS(HarmonicsPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  void resetProcessing();
  void applyFilterParams();
  void applyToneParams();
  void processSample(float& L, float& R, bool bypass, bool preListen,
                     bool postListen, float dry, float wet);
  void observeSend(float sendL, float sendR);

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;

  Dsp::TapDistortion distL_;
  Dsp::TapDistortion distR_;
  /** Feed: input → waveshaper (wet path only). */
  Dsp::ComplementaryBandFilter pre_;
  /** Post after waveshaper (wet path). */
  Dsp::ComplementaryBandFilter postHot_;
  /** Same Post coeffs/state twin on the unshaped send — for dry-safe delta mix. */
  Dsp::ComplementaryBandFilter postClean_;
  /** High-shelf on wet delta only (after hot−clean) — keeps Dry notch-free.
   *  Shelf fc tracks the geometric mean of the Feed∩Post passband. */
  Dsp::BiquadD1 toneL_;
  Dsp::BiquadD1 toneR_;
  float toneDb_ = 0.f;
  float toneFc_ = 0.f;

  /** Soft |send| envelope for active-zone highlight (0…1). */
  float shapeZone_ = 0.f;
  float shapeZoneFall_ = 0.999f;
  /** Per-block histogram accumulation (audio thread). */
  float histAcc_[kShapeHistBins] {};
  /** Decayed display densities, published in takeShapePoint. */
  float histDisp_[kShapeHistBins] {};
};

} // namespace Harmonics
} // namespace calfNXT
