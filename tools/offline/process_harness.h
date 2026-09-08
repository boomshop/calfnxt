#pragma once

// Feed float32 stereo blocks into any EffectBase-derived plugin via ProcessData.
// This is the durable offline path: same process() as the VST host.

#include "effect_base.h"

#include "pluginterfaces/vst/ivstaudioprocessor.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <vector>

namespace calfNXT {
namespace Offline {

class ProcessHarness
{
public:
  explicit ProcessHarness(Plugin::EffectBase& plugin)
  : plugin_(plugin)
  {
  }

  bool setup(double sampleRate, int maxBlock)
  {
    sampleRate_ = sampleRate;
    maxBlock_ = std::max(16, maxBlock);

    Steinberg::tresult r = plugin_.initialize(nullptr);
    if (r != Steinberg::kResultOk && r != Steinberg::kResultTrue)
      return false;

    Steinberg::Vst::SpeakerArrangement inArr = Steinberg::Vst::SpeakerArr::kStereo;
    Steinberg::Vst::SpeakerArrangement outArr = Steinberg::Vst::SpeakerArr::kStereo;
    plugin_.setBusArrangements(&inArr, 1, &outArr, 1);
    plugin_.activateBus(Steinberg::Vst::kAudio, Steinberg::Vst::kInput, 0, true);
    plugin_.activateBus(Steinberg::Vst::kAudio, Steinberg::Vst::kOutput, 0, true);

    Steinberg::Vst::ProcessSetup setup {};
    setup.processMode = Steinberg::Vst::kRealtime;
    setup.symbolicSampleSize = Steinberg::Vst::kSample32;
    setup.maxSamplesPerBlock = maxBlock_;
    setup.sampleRate = sampleRate_;
    if (plugin_.setupProcessing(setup) != Steinberg::kResultOk)
      return false;
    if (plugin_.setActive(true) != Steinberg::kResultOk)
      return false;

    inL_.assign(size_t(maxBlock_), 0.f);
    inR_.assign(size_t(maxBlock_), 0.f);
    outL_.assign(size_t(maxBlock_), 0.f);
    outR_.assign(size_t(maxBlock_), 0.f);
    return true;
  }

  void setPlain(Steinberg::Vst::ParamID id, float plain)
  {
    if (auto* p = plugin_.getParameterObject(id))
      p->setNormalized(p->toNormalized(plain));
  }

  /** Process mono (duplicated to L/R). Returns frames written to outMono (may trim). */
  int processMono(const float* inMono, float* outMono, int nFrames)
  {
    int done = 0;
    while (done < nFrames)
    {
      const int n = std::min(maxBlock_, nFrames - done);
      for (int i = 0; i < n; ++i)
      {
        inL_[size_t(i)] = inMono[done + i];
        inR_[size_t(i)] = inMono[done + i];
        outL_[size_t(i)] = 0.f;
        outR_[size_t(i)] = 0.f;
      }

      Steinberg::Vst::AudioBusBuffers inBus {};
      Steinberg::Vst::AudioBusBuffers outBus {};
      float* inCh[2] = {inL_.data(), inR_.data()};
      float* outCh[2] = {outL_.data(), outR_.data()};
      inBus.numChannels = 2;
      inBus.channelBuffers32 = inCh;
      inBus.silenceFlags = 0;
      outBus.numChannels = 2;
      outBus.channelBuffers32 = outCh;
      outBus.silenceFlags = 0;

      Steinberg::Vst::ProcessData data {};
      data.processMode = Steinberg::Vst::kRealtime;
      data.symbolicSampleSize = Steinberg::Vst::kSample32;
      data.numSamples = n;
      data.numInputs = 1;
      data.numOutputs = 1;
      data.inputs = &inBus;
      data.outputs = &outBus;
      data.inputParameterChanges = nullptr;
      data.outputParameterChanges = nullptr;
      data.processContext = nullptr;

      plugin_.process(data);

      for (int i = 0; i < n; ++i)
        outMono[done + i] = 0.5f * (outL_[size_t(i)] + outR_[size_t(i)]);
      done += n;
    }
    return done;
  }

  Plugin::EffectBase& plugin() { return plugin_; }

private:
  Plugin::EffectBase& plugin_;
  double sampleRate_ = 48000.0;
  int maxBlock_ = 512;
  std::vector<float> inL_, inR_, outL_, outR_;
};

} // namespace Offline
} // namespace calfNXT
