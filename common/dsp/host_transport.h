#pragma once

// Host transport + VST3 silence-flag helpers shared by process().

#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"

#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>

namespace calfNXT {
namespace Dsp {

/**
 * True while the host transport is rolling.
 * No process context (offline harness, some hosts) counts as playing so
 * history still records. Reaper clears kPlaying on stop and then may flush
 * extra process() calls — those must not scroll the chart.
 */
inline bool hostTransportPlaying(const Steinberg::Vst::ProcessData& data) noexcept
{
  const auto* ctx = data.processContext;
  if (!ctx)
    return true;
  return (ctx->state & Steinberg::Vst::ProcessContext::kPlaying) != 0;
}

inline void markOutputSilent(Steinberg::Vst::ProcessData& data) noexcept;

/**
 * Settled silence.
 *
 * While the transport is playing, clear the output silence flag so the host
 * keeps calling at the audio rate. A silence flag makes Reaper deliver the
 * gap as a burst, and the history then leaps between UI frames. While
 * stopped, mark the output silent so that stop flush ends.
 *
 * buffersAlreadyQuiet: begin() already wrote the quiet program into the
 * outputs. Otherwise the buffers are zeroed before the flag is cleared —
 * a cleared flag with a stale buffer would replay the previous block.
 */
inline void finishSettledSilence(Steinberg::Vst::ProcessData& data, bool playing,
                                 bool buffersAlreadyQuiet) noexcept
{
  using namespace Steinberg;
  using namespace Steinberg::Vst;
  if (!playing)
  {
    markOutputSilent(data);
    return;
  }
  if (!data.outputs || data.numOutputs < 1)
    return;
  auto& bus = data.outputs[0];
  if (buffersAlreadyQuiet)
  {
    bus.silenceFlags = 0;
    return;
  }
  const int32 n = data.numSamples;
  const int32 nCh = bus.numChannels;
  if (n <= 0 || nCh <= 0)
  {
    markOutputSilent(data);
    return;
  }
  if (data.symbolicSampleSize == kSample32)
  {
    float** buf = bus.channelBuffers32;
    if (!buf)
    {
      markOutputSilent(data);
      return;
    }
    for (int32 ch = 0; ch < nCh; ++ch)
    {
      if (!buf[ch])
      {
        markOutputSilent(data);
        return;
      }
    }
    for (int32 ch = 0; ch < nCh; ++ch)
      std::memset(buf[ch], 0, sizeof(float) * static_cast<size_t>(n));
  }
  else
  {
    double** buf = bus.channelBuffers64;
    if (!buf)
    {
      markOutputSilent(data);
      return;
    }
    for (int32 ch = 0; ch < nCh; ++ch)
    {
      if (!buf[ch])
      {
        markOutputSilent(data);
        return;
      }
    }
    for (int32 ch = 0; ch < nCh; ++ch)
      std::memset(buf[ch], 0, sizeof(double) * static_cast<size_t>(n));
  }
  bus.silenceFlags = 0;
}

/** Bitmask: every channel on this output bus is silent. */
inline void markOutputSilent(Steinberg::Vst::ProcessData& data) noexcept
{
  if (!data.outputs || data.numOutputs < 1)
    return;
  auto& bus = data.outputs[0];
  const int nCh = bus.numChannels;
  if (nCh <= 0)
    bus.silenceFlags = 1u;
  else if (nCh >= 32)
    bus.silenceFlags = 0xffffffffu;
  else
    bus.silenceFlags = (1u << static_cast<unsigned>(nCh)) - 1u;
}

/**
 * Host silence flag, missing buffers, or peak under ~−140 dBFS.
 * Does not treat a missing bus as hot audio.
 */
inline bool audioBusIsQuiet(const Steinberg::Vst::ProcessData& data, int bus) noexcept
{
  using namespace Steinberg;
  using namespace Steinberg::Vst;
  if (!data.inputs || bus < 0 || bus >= data.numInputs)
    return true;
  const AudioBusBuffers& in = data.inputs[bus];
  if (in.silenceFlags != 0)
    return true;
  const int32 n = data.numSamples;
  const int32 nCh = in.numChannels;
  if (n <= 0 || nCh <= 0)
    return true;

  // ~−140 dBFS. Matches IoStage::kQuietPeak without including that header.
  constexpr float kQuiet = 1.0e-7f;

  if (data.symbolicSampleSize == kSample32)
  {
    float* const* buf = in.channelBuffers32;
    if (!buf)
      return true;
    for (int32 ch = 0; ch < nCh; ++ch)
    {
      const float* p = buf[ch];
      if (!p)
        continue;
      for (int32 i = 0; i < n; ++i)
      {
        if (std::fabs(p[i]) >= kQuiet)
          return false;
      }
    }
    return true;
  }

  double* const* buf = in.channelBuffers64;
  if (!buf)
    return true;
  for (int32 ch = 0; ch < nCh; ++ch)
  {
    const double* p = buf[ch];
    if (!p)
      continue;
    for (int32 i = 0; i < n; ++i)
    {
      if (std::fabs(p[i]) >= static_cast<double>(kQuiet))
        return false;
    }
  }
  return true;
}

/**
 * How many samples of scrolling history this process() call may consume.
 *
 * Reaper delivers silence and stop-flushes as a burst (many callbacks, or one
 * huge block) between two UI frames. Feeding all of that into the ring makes
 * the chart leap. Steady playback grants the whole block; a burst or a
 * multi-second silence chunk is limited to the wall-clock gap, and that gap
 * itself is capped so one late callback cannot skip the window.
 */
class HistoryPacer
{
public:
  int allow(int requested, double sampleRate) noexcept
  {
    if (requested <= 0 || !(sampleRate > 1000.0))
      return 0;
    using clock = std::chrono::steady_clock;
    const auto now = clock::now();
    // ~one UI frame. Larger than a normal audio buffer, smaller than a leap.
    constexpr double kMaxStepSec = 0.04;
    const int cap = static_cast<int>(sampleRate * kMaxStepSec);
    if (!armed_)
    {
      armed_ = true;
      last_ = now;
      credit_ = 0.0;
      return requested < cap ? requested : cap;
    }
    double dt = std::chrono::duration<double>(now - last_).count();
    last_ = now;
    if (dt < 0.0)
      dt = 0.0;
    if (dt > kMaxStepSec)
      dt = kMaxStepSec;
    credit_ += dt * sampleRate;
    // A few samples of jitter: a steady buffer stays 1:1 with the host.
    constexpr double kJitter = 64.0;
    int grant = requested;
    if (static_cast<double>(requested) > credit_ + kJitter)
      grant = static_cast<int>(credit_);
    if (grant < 0)
      grant = 0;
    if (grant > cap)
      grant = cap;
    credit_ -= static_cast<double>(grant);
    if (credit_ < 0.0)
      credit_ = 0.0;
    const double maxCredit = sampleRate * 0.005;
    if (credit_ > maxCredit)
      credit_ = maxCredit;
    return grant;
  }

private:
  bool armed_ = false;
  std::chrono::steady_clock::time_point last_ {};
  double credit_ = 0.0;
};

} // namespace Dsp
} // namespace calfNXT
