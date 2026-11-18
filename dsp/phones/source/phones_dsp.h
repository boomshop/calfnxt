#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "phones_engine.h"
#include "viz_source.h"

#include "phones_params.h"

namespace calfNXT {
namespace Phones {

class PhonesPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  PhonesPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new PhonesPlugin);
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

  OBJ_METHODS(PhonesPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  struct BlockState
  {
    bool bypass = false;
    bool mono = false;
    float amount = 1.f;
    float angle = 30.f;
    float distance = 1.2f;
    float room = 0.5f;
    float live = 0.f;
    float scatter = 0.4f;
  };

  BlockState makeBlockState() const;
  void resetProcessing();

  float params_[kParamCount] {};

  Dsp::IoStage io_;
  PhonesEngine engine_;
  double sampleRate_ = 44100.0;
  bool bypassed_ = false;
};

} // namespace Phones
} // namespace calfNXT
