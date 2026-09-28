#pragma once

// Shared ChannelMode × StereoLink → detector L/R for dynamics sidechains.

#include "channel_mode.h"
#include "compressor.h"
#include "sidechain_filter.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Dsp {

/**
 * Filter sc L/R into a linked detector pair.
 * Unused stereo path still runs so filter state stays continuous.
 */
inline void processDetectorStereo(SidechainFilter& sc, ChannelMode channel,
                                  StereoLink link, float scL, float scR,
                                  float& detL, float& detR)
{
  switch (channel)
  {
    case ChannelMode::Left:
    {
      const float x = sc.processChannel(0, scL);
      (void)sc.processChannel(1, scR);
      detL = x;
      detR = x;
      break;
    }
    case ChannelMode::Right:
    {
      (void)sc.processChannel(0, scL);
      const float x = sc.processChannel(1, scR);
      detL = x;
      detR = x;
      break;
    }
    case ChannelMode::Mid:
    {
      float mid = 0.f;
      float side = 0.f;
      encodeMs(scL, scR, mid, side);
      (void)side;
      const float x = sc.processMono(mid);
      detL = x;
      detR = x;
      break;
    }
    case ChannelMode::Side:
    {
      float mid = 0.f;
      float side = 0.f;
      encodeMs(scL, scR, mid, side);
      (void)mid;
      const float x = sc.processMono(side);
      detL = x;
      detR = x;
      break;
    }
    case ChannelMode::Stereo:
    default:
      if (link == StereoLink::Mid)
      {
        const float mid = sc.processMono(0.5f * (scL + scR));
        detL = mid;
        detR = mid;
      }
      else
      {
        detL = sc.processChannel(0, scL);
        detR = sc.processChannel(1, scR);
      }
      break;
  }
}

/** Absolute peak of L/R under ChannelMode (history Out / cut tips). */
inline float channelAbsPeak(ChannelMode mode, float L, float R)
{
  switch (mode)
  {
    case ChannelMode::Left:
      return std::fabs(L);
    case ChannelMode::Right:
      return std::fabs(R);
    case ChannelMode::Mid:
    {
      float mid = 0.f;
      float side = 0.f;
      encodeMs(L, R, mid, side);
      (void)side;
      return std::fabs(mid);
    }
    case ChannelMode::Side:
    {
      float mid = 0.f;
      float side = 0.f;
      encodeMs(L, R, mid, side);
      (void)mid;
      return std::fabs(side);
    }
    case ChannelMode::Stereo:
    default:
      return std::max(std::fabs(L), std::fabs(R));
  }
}

} // namespace Dsp
} // namespace calfNXT
