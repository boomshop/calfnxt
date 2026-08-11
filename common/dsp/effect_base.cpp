#include "effect_base.h"

#include "web_editor.h"

#include "pluginterfaces/base/ustring.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"

#include <cstring>

namespace calfNXT {
namespace Plugin {

using namespace Steinberg;
using namespace Steinberg::Vst;

EffectBase::EffectBase(ViewRect editorSize)
: editorSize_(editorSize)
{
}

tresult PLUGIN_API EffectBase::canProcessSampleSize(int32 symbolicSampleSize)
{
  if (symbolicSampleSize == kSample32 || symbolicSampleSize == kSample64)
    return kResultTrue;
  return kResultFalse;
}

tresult PLUGIN_API EffectBase::setBusArrangements(SpeakerArrangement* inputs, int32 numIns,
                                                  SpeakerArrangement* outputs, int32 numOuts)
{
  if (numIns == 1 && numOuts == 1 && inputs && outputs && inputs[0] == SpeakerArr::kStereo &&
      outputs[0] == SpeakerArr::kStereo)
    return SingleComponentEffect::setBusArrangements(inputs, numIns, outputs, numOuts);
  return kResultFalse;
}

IPlugView* PLUGIN_API EffectBase::createView(FIDString name)
{
  if (name && std::strcmp(name, ViewType::kEditor) == 0)
  {
    auto* editor = new Ui::WebEditor(this, editorSize_, editorHtml());
    editor->setVizSource(vizSource());
    return editor;
  }
  return nullptr;
}

void EffectBase::addStereoIO(const TChar* inName, const TChar* outName)
{
  addAudioInput(inName ? inName : STR16("Stereo In"), SpeakerArr::kStereo);
  addAudioOutput(outName ? outName : STR16("Stereo Out"), SpeakerArr::kStereo);
}

bool EffectBase::applyLastParamPlain(ProcessData& data, ParamID id, float& plainOut)
{
  if (!data.inputParameterChanges)
    return false;
  const int32 count = data.inputParameterChanges->getParameterCount();
  for (int32 i = 0; i < count; ++i)
  {
    IParamValueQueue* queue = data.inputParameterChanges->getParameterData(i);
    if (!queue || queue->getParameterId() != id)
      continue;
    const int32 points = queue->getPointCount();
    ParamValue value = 0;
    int32 sampleOffset = 0;
    if (points > 0 && queue->getPoint(points - 1, sampleOffset, value) == kResultTrue)
    {
      if (auto* p = getParameterObject(id))
      {
        plainOut = static_cast<float>(p->toPlain(value));
        // Keep controller Parameter in sync — hosts may automate only via the
        // process queue; without this, dependents/UI never see the change and
        // syncParamPlain() would overwrite the DSP with a stale controller value.
        p->setNormalized(value);
        return true;
      }
    }
  }
  return false;
}

void EffectBase::syncParamPlain(ParamID id, float& plainOut)
{
  if (auto* p = getParameterObject(id))
    plainOut = static_cast<float>(p->toPlain(p->getNormalized()));
}

void EffectBase::readParamPlains(float* plains, int count)
{
  if (!plains || count <= 0)
    return;
  for (int i = 0; i < count; ++i)
    syncParamPlain(static_cast<ParamID>(i), plains[i]);
}

void EffectBase::syncParamPlains(ProcessData& data, float* plains, int count)
{
  // auxvst-style: walk each host queue once (not once per parameter).
  if (data.inputParameterChanges)
  {
    const int32 nQueues = data.inputParameterChanges->getParameterCount();
    for (int32 i = 0; i < nQueues; ++i)
    {
      IParamValueQueue* queue = data.inputParameterChanges->getParameterData(i);
      if (!queue)
        continue;
      const ParamID id = queue->getParameterId();
      if (static_cast<int>(id) < 0 || static_cast<int>(id) >= count)
        continue;
      const int32 points = queue->getPointCount();
      ParamValue value = 0;
      int32 sampleOffset = 0;
      if (points > 0 && queue->getPoint(points - 1, sampleOffset, value) == kResultTrue)
      {
        if (auto* p = getParameterObject(id))
          p->setNormalized(value);
      }
    }
  }
  readParamPlains(plains, count);
}

void EffectBase::notifyHostParamValues()
{
  if (!componentHandler)
    return;

  // Push each current normalized value so hosts that started at 0 (plain min
  // for bipolar ranges like Balance −1…1) pick up RangeParameter defaults.
  const int32 n = getParameterCount();
  for (int32 i = 0; i < n; ++i)
  {
    ParameterInfo info {};
    if (getParameterInfo(i, info) != kResultOk)
      continue;
    if (auto* p = getParameterObject(info.id))
    {
      const ParamValue norm = p->getNormalized();
      beginEdit(info.id);
      performEdit(info.id, norm);
      endEdit(info.id);
    }
  }
  componentHandler->restartComponent(kParamValuesChanged);
}

void EffectBase::notifyHostStateRestored()
{
  if (!componentHandler)
    return;
  componentHandler->restartComponent(kParamValuesChanged);
}

tresult PLUGIN_API EffectBase::setComponentState(IBStream* state)
{
  // Same object implements IComponent + IEditController. Re-apply processor
  // state so Parameter objects stay in sync; return kResultOk so hosts like
  // Ardour mark the load as synced (kNotImplemented skips their shadow refresh).
  return setState(state);
}

tresult PLUGIN_API EffectBase::setActive(TBool state)
{
  const tresult r = SingleComponentEffect::setActive(state);
  if (state)
    notifyHostParamValues();
  return r;
}

tresult PLUGIN_API EffectBase::setComponentHandler(IComponentHandler* handler)
{
  const tresult r = EditController::setComponentHandler(handler);
  if (handler)
    notifyHostParamValues();
  return r;
}

} // namespace Plugin
} // namespace calfNXT
