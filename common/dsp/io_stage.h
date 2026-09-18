#pragma once

#include "gain_util.h"
#include "peak_hold.h"

#include "pluginterfaces/vst/ivstaudioprocessor.h"

#include <cmath>

namespace calfNXT {
namespace Dsp {

/** Shared In/Out gain + header meters for every plugin process().
 *
 * Call order per block:
 *   1. setGainsDb / setBypassGains from synced plains
 *   2. begin() — copy in→out with in_gain, accumulate input peaks (after gain)
 *   3. plugin DSP in-place on outputs
 *   4. end() — apply out_gain, accumulate output peaks
 *
 * Silence: begin() returns false only when the host sets silenceFlags.
 * Many hosts (Ardour) send zero buffers without flags — use inputWasQuiet()
 * (peak tracked during the copy) for content-based idle fast-paths.
 */
class IoStage
{
public:
  /** Below this |sample| after in_gain the block counts as quiet (~−140 dBFS). */
  static constexpr float kQuietPeak = 1.0e-7f;

  void setGainsDb(float inDb, float outDb)
  {
    inGainDb_ = inDb;
    outGainDb_ = outDb;
  }

  /** When true, In/Out gains are unity (e.g. plugin bypass). Meters still run. */
  void setBypassGains(bool bypass) { bypassGains_ = bypass; }

  int takeInputLevelsDb(float* out, int maxOut) { return peakIn_.takeDb(out, maxOut); }
  int takeOutputLevelsDb(float* out, int maxOut) { return peakOut_.takeDb(out, maxOut); }

  void setInputMeterChannels(int ch) { peakIn_.setChannels(ch); }
  void setOutputMeterChannels(int ch) { peakOut_.setChannels(ch); }

  /** True after begin() when host silenceFlags were set or the copied peak was tiny. */
  bool inputWasQuiet() const { return quiet_; }

  /** Mono input → duplicate to stereo outputs with in_gain + input metering. */
  bool beginMonoToStereo(Steinberg::Vst::ProcessData& data)
  {
    using namespace Steinberg;
    using namespace Steinberg::Vst;

    quiet_ = true;
    if (data.numInputs < 1 || data.numOutputs < 1 || !data.inputs || !data.outputs)
      return false;
    if (data.outputs[0].numChannels < 2)
      return false;
    if (data.inputs[0].silenceFlags != 0)
    {
      data.outputs[0].silenceFlags = data.inputs[0].silenceFlags;
      return false;
    }
    data.outputs[0].silenceFlags = 0;

    const float gIn = bypassGains_ ? 1.f : dbToLin(inGainDb_);
    const int32 nFrames = data.numSamples;
    float peak = 0.f;

    if (data.symbolicSampleSize == kSample32)
    {
      auto** in = data.inputs[0].channelBuffers32;
      auto** out = data.outputs[0].channelBuffers32;
      for (int32 i = 0; i < nFrames; ++i)
      {
        const float y = in[0][i] * gIn;
        out[0][i] = y;
        out[1][i] = y;
        peakIn_.accumulate(0, y);
        const float a = std::fabs(y);
        if (a > peak)
          peak = a;
      }
    }
    else
    {
      auto** in = data.inputs[0].channelBuffers64;
      auto** out = data.outputs[0].channelBuffers64;
      const double g = static_cast<double>(gIn);
      for (int32 i = 0; i < nFrames; ++i)
      {
        const double y = in[0][i] * g;
        const float yf = static_cast<float>(y);
        out[0][i] = y;
        out[1][i] = y;
        peakIn_.accumulate(0, yf);
        const float a = std::fabs(yf);
        if (a > peak)
          peak = a;
      }
    }
    quiet_ = peak < kQuietPeak;
    return true;
  }

  /** Prepare outputs with in_gain + input metering. false = host silence / no audio.
   *
   * Hosts may renegotiate mono-in / stereo-out (EffectBase allows it). Always
   * fill every output channel — duplicate the last input when nOut > nIn —
   * otherwise the unused right buffer stays garbage/NaN and stereo DSP reads
   * it as hard digital trash (mute after denormal scrub, wild GR spikes).
   */
  bool begin(Steinberg::Vst::ProcessData& data)
  {
    using namespace Steinberg;
    using namespace Steinberg::Vst;

    quiet_ = true;
    if (data.numInputs < 1 || data.numOutputs < 1 || !data.inputs || !data.outputs)
      return false;
    if (data.inputs[0].silenceFlags != 0)
    {
      data.outputs[0].silenceFlags = data.inputs[0].silenceFlags;
      return false;
    }
    data.outputs[0].silenceFlags = 0;

    const float gIn = bypassGains_ ? 1.f : dbToLin(inGainDb_);
    const int32 nIn = data.inputs[0].numChannels;
    const int32 nOut = data.outputs[0].numChannels;
    const int32 nFrames = data.numSamples;
    if (nIn < 1 || nOut < 1)
      return false;
    float peak = 0.f;

    if (data.symbolicSampleSize == kSample32)
    {
      auto** in = data.inputs[0].channelBuffers32;
      auto** out = data.outputs[0].channelBuffers32;
      if (!in || !out)
        return false;
      const int32 nCopy = nIn < nOut ? nIn : nOut;
      for (int32 ch = 0; ch < nCopy; ++ch)
      {
        if (!in[ch] || !out[ch])
          return false;
        for (int32 i = 0; i < nFrames; ++i)
        {
          const float y = in[ch][i] * gIn;
          out[ch][i] = y;
          peakIn_.accumulate(ch, y);
          const float a = std::fabs(y);
          if (a > peak)
            peak = a;
        }
      }
      // Pad missing outs (typical: mono in → stereo out).
      if (nOut > nCopy)
      {
        float* src = out[nCopy - 1];
        for (int32 ch = nCopy; ch < nOut; ++ch)
        {
          if (!out[ch])
            return false;
          if (out[ch] != src)
          {
            for (int32 i = 0; i < nFrames; ++i)
              out[ch][i] = src[i];
          }
          for (int32 i = 0; i < nFrames; ++i)
            peakIn_.accumulate(ch, src[i]);
        }
      }
    }
    else
    {
      auto** in = data.inputs[0].channelBuffers64;
      auto** out = data.outputs[0].channelBuffers64;
      if (!in || !out)
        return false;
      const double g = static_cast<double>(gIn);
      const int32 nCopy = nIn < nOut ? nIn : nOut;
      for (int32 ch = 0; ch < nCopy; ++ch)
      {
        if (!in[ch] || !out[ch])
          return false;
        for (int32 i = 0; i < nFrames; ++i)
        {
          const double y = in[ch][i] * g;
          out[ch][i] = y;
          peakIn_.accumulate(ch, static_cast<float>(y));
          const float a = std::fabs(static_cast<float>(y));
          if (a > peak)
            peak = a;
        }
      }
      if (nOut > nCopy)
      {
        double* src = out[nCopy - 1];
        for (int32 ch = nCopy; ch < nOut; ++ch)
        {
          if (!out[ch])
            return false;
          if (out[ch] != src)
          {
            for (int32 i = 0; i < nFrames; ++i)
              out[ch][i] = src[i];
          }
          for (int32 i = 0; i < nFrames; ++i)
            peakIn_.accumulate(ch, static_cast<float>(src[i]));
        }
      }
    }
    quiet_ = peak < kQuietPeak;
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
  bool quiet_ = true;
  Viz::LevelPeakHold peakIn_ {2};
  Viz::LevelPeakHold peakOut_ {2};
};

} // namespace Dsp
} // namespace calfNXT
