#pragma once

#include "effect_base.h"
#include "elliptic_crossover.h"
#include "io_stage.h"
#include "stereo_field_tap.h"
#include "viz_source.h"

#include "elliptic_params.h"

#include <cmath>

namespace calfNXT {
namespace Elliptic {

class EllipticPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  EllipticPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new EllipticPlugin);
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
  int takeCorrelation(float* out, int maxOut) override;
  int takeGonio(float* out, int maxOut) override;
  const char* vizStereoFieldId() const override { return "elliptic"; }

  OBJ_METHODS(EllipticPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  struct BlockState
  {
    bool listen = false;
    float amount = 1.f;
    float freq = 80.f;
    float slope = 12.f;
  };

  BlockState makeBlockState() const;
  void updateAmountCoeff();
  void processSample(const BlockState& state, float& L, float& R);

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  Dsp::EllipticCrossover cross_;
  Dsp::StereoFieldTap fieldTap_;
  /** Bass band only. Goniometer; correlation stays on fieldTap_ (full output). */
  Dsp::StereoFieldTap bassTap_;
  double sampleRate_ = 44100.0;
  float amountCur_ = 1.f;
  float amountCoeff_ = 1.f;
};

} // namespace Elliptic
} // namespace calfNXT
