#include "effect_base.h"

#include "web_editor.h"

#include "pluginterfaces/base/ustring.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"

#include <algorithm>
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
  if (sidechainInput_ && numIns == 2 && numOuts == 1 && inputs && outputs)
  {
    if (SpeakerArr::getChannelCount(inputs[0]) == 2 &&
        SpeakerArr::getChannelCount(inputs[1]) == 2 &&
        SpeakerArr::getChannelCount(outputs[0]) == 2)
      return SingleComponentEffect::setBusArrangements(inputs, numIns, outputs, numOuts);
    return kResultFalse;
  }
  if (numIns == 1 && numOuts == 1 && inputs && outputs)
  {
    if (inputs[0] == SpeakerArr::kStereo && outputs[0] == SpeakerArr::kStereo)
      return SingleComponentEffect::setBusArrangements(inputs, numIns, outputs, numOuts);
    if (inputs[0] == SpeakerArr::kMono && outputs[0] == SpeakerArr::kStereo)
      return SingleComponentEffect::setBusArrangements(inputs, numIns, outputs, numOuts);
  }
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

void EffectBase::addStereoWithSidechainIO(const TChar* inName, const TChar* outName,
                                          const TChar* sidechainName)
{
  addStereoIO(inName, outName);
  addAudioInput(sidechainName ? sidechainName : STR16("Sidechain"), SpeakerArr::kStereo, kAux, 0);
  sidechainInput_ = true;
}

bool EffectBase::isAudioInputActive(int32 index)
{
  BusList* list = getBusList(kAudio, kInput);
  if (!list || index < 0 || index >= static_cast<int32>(list->size()))
    return false;
  if (Bus* bus = list->at(index))
    return bus->isActive();
  return false;
}

void EffectBase::addMonoInStereoOut(const TChar* inName, const TChar* outName)
{
  addAudioInput(inName ? inName : STR16("Mono In"), SpeakerArr::kMono);
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
  // Ardour session load: setComponentHandler/Ports may queue defaults (or stale
  // values) that arrive in process() *after* our setState restored the chunk.
  // Preset recall holds the process lock so it does not hit this race.
  int suppress = suppressHostParamSync_.load(std::memory_order_relaxed);
  if (suppress > 0)
  {
    suppressHostParamSync_.store(suppress - 1, std::memory_order_relaxed);
    const int n = std::min(count, static_cast<int>(restoredPlains_.size()));
    for (int i = 0; i < n; ++i)
    {
      if (auto* p = getParameterObject(static_cast<ParamID>(i)))
        p->setNormalized(p->toNormalized(restoredPlains_[static_cast<size_t>(i)]));
    }
    readParamPlains(plains, count);
    return;
  }

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

void EffectBase::notifyHostStateRestored()
{
  const int32 n = getParameterCount();
  if (n > 0)
  {
    restoredPlains_.resize(static_cast<size_t>(n));
    readParamPlains(restoredPlains_.data(), n);
    // Enough blocks for engine spin-up + Ardour draining pre-setState queues.
    suppressHostParamSync_.store(32, std::memory_order_relaxed);
  }
  // Skip restartComponent: Qtractor SIGSEGVs on that re-entrancy during
  // instance setup. Ardour/Carla re-query getParamNormalized / process;
  // suppressHostParamSync_ protects against stomping the restored plains.
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
  // Do not call restartComponent / edit gestures here: Qtractor SIGSEGVs on
  // re-entrant host callbacks while activating the instance.
  return SingleComponentEffect::setActive(state);
}

tresult PLUGIN_API EffectBase::setComponentHandler(IComponentHandler* handler)
{
  // Do not call restartComponent / edit gestures here: hosts such as Qtractor
  // are still wiring the handler and crash on re-entrant callbacks.
  return EditController::setComponentHandler(handler);
}

} // namespace Plugin
} // namespace calfNXT
