#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "viz_source.h"

#include "split_params.h"

namespace calfNXT {
namespace Split {

class SplitPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  SplitPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new SplitPlugin);
  }

  Steinberg::tresult PLUGIN_API initialize(Steinberg::FUnknown* context) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API process(Steinberg::Vst::ProcessData& data) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setState(Steinberg::IBStream* state) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API getState(Steinberg::IBStream* state) SMTG_OVERRIDE;

  Ui::IVizSource* vizSource() override { return this; }
  int takeInputLevelsDb(float* out, int maxOut) override { return io_.takeInputLevelsDb(out, maxOut); }
  int takeOutputLevelsDb(float* out, int maxOut) override { return io_.takeOutputLevelsDb(out, maxOut); }

  OBJ_METHODS(SplitPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  struct BlockState
  {
    float volLinL = 1.f;
    float volLinR = 1.f;
    bool muteL = false;
    bool muteR = false;
    bool phaseL = false;
    bool phaseR = false;
  };

  BlockState makeBlockState() const;

  float params_[kParamCount] {};
  Dsp::IoStage io_;
};

} // namespace Split
} // namespace calfNXT
