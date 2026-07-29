#pragma once

#include "gain_util.h"
#include "peak_hold.h"

#include "pluginterfaces/vst/ivstaudioprocessor.h"

namespace calfNXT {
namespace Dsp {

/** Shared In/Out gain + header meters for every plugin process().
 *
 * Call order per block:
 *   1. setGainsDb / setBypassGains from synced plains
 *   2. begin() — copy in→out with in_gain, accumulate input peaks (after gain)
 *   3. plugin DSP in-place on outputs
 *   4. end() — apply out_gain, accumulate output peaks
 */
class IoStage
{
public:
  void setGainsDb(float inDb, float outDb)
  {
    inGainDb_ = inDb;
    outGainDb_ = outDb;
  }

  /** When true, In/Out gains are unity (e.g. plugin bypass). Meters still run. */
  void setBypassGains(bool bypass) { bypassGains_ = bypass; }

  int takeInputLevelsDb(float* out, int maxOut) { return peakIn_.takeDb(out, maxOut); }
  int takeOutputLevelsDb(float* out, int maxOut) { return peakOut_.takeDb(out, maxOut); }

  /** Prepare outputs with in_gain + input metering. false = silence / no audio. */
  bool begin(Steinberg::Vst::ProcessData& data)
  {
    using namespace Steinberg;
    using namespace Steinberg::Vst;

    if (data.numInputs < 1 || data.numOutputs < 1 || !data.inputs || !data.outputs)
      return false;
    if (data.inputs[0].silenceFlags != 0)
    {
      data.outputs[0].silenceFlags = data.inputs[0].silenceFlags;
      return false;
    }
    data.outputs[0].silenceFlags = 0;

    const float gIn = bypassGains_ ? 1.f : dbToLin(inGainDb_);
    const int32 nCh = data.inputs[0].numChannels;
    const int32 nFrames = data.numSamples;

    if (data.symbolicSampleSize == kSample32)
    {
      auto** in = data.inputs[0].channelBuffers32;
      auto** out = data.outputs[0].channelBuffers32;
      for (int32 ch = 0; ch < nCh; ++ch)
      {
        for (int32 i = 0; i < nFrames; ++i)
        {
          const float y = in[ch][i] * gIn;
          out[ch][i] = y;
          peakIn_.accumulate(ch, y);
        }
      }
    }
    else
    {
      auto** in = data.inputs[0].channelBuffers64;
      auto** out = data.outputs[0].channelBuffers64;
      const double g = static_cast<double>(gIn);
      for (int32 ch = 0; ch < nCh; ++ch)
      {
        for (int32 i = 0; i < nFrames; ++i)
        {
          const double y = in[ch][i] * g;
          out[ch][i] = y;
          peakIn_.accumulate(ch, static_cast<float>(y));
        }
      }
    }
    return true;
  }

  /** Apply out_gain in-place on outputs + output metering. */
  void end(Steinberg::Vst::ProcessData& data)
  {
    using namespace Steinberg;
    using namespace Steinberg::Vst;

    if (data.numOutputs < 1 || !data.outputs)
      return;

    data.outputs[0].silenceFlags = 0;
    const float gOut = bypassGains_ ? 1.f : dbToLin(outGainDb_);
    const int32 nCh = data.outputs[0].numChannels;
    const int32 nFrames = data.numSamples;

    if (data.symbolicSampleSize == kSample32)
    {
      auto** out = data.outputs[0].channelBuffers32;
      for (int32 ch = 0; ch < nCh; ++ch)
      {
        for (int32 i = 0; i < nFrames; ++i)
        {
          const float y = out[ch][i] * gOut;
          out[ch][i] = y;
          peakOut_.accumulate(ch, y);
        }
      }
    }
    else
    {
      auto** out = data.outputs[0].channelBuffers64;
      const double g = static_cast<double>(gOut);
      for (int32 ch = 0; ch < nCh; ++ch)
      {
        for (int32 i = 0; i < nFrames; ++i)
        {
          const double y = out[ch][i] * g;
          out[ch][i] = y;
          peakOut_.accumulate(ch, static_cast<float>(y));
        }
      }
    }
  }

private:
  float inGainDb_ = 0.f;
  float outGainDb_ = 0.f;
  bool bypassGains_ = false;
  Viz::LevelPeakHold peakIn_ {2};
  Viz::LevelPeakHold peakOut_ {2};
};

} // namespace Dsp
} // namespace calfNXT
