#pragma once

// Lookahead limiter core — Calf heritage (Christian Holschuh / Markus Schmidt).
// calfNXT extensions: gain curves, ASC peak ring, click-free look changes
// (fixed ring + equal-power crossfade), idle sleep.

#include "dsp_math.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace calfNXT {
namespace Dsp {

enum class LimitCurve : int
{
  Linear = 0,
  Log = 1,
  Cos = 2,
};

class LookaheadLimiter
{
public:
  LookaheadLimiter() = default;

  void setSampleRate(uint32_t sr)
  {
    srate_ = std::max(1u, sr);
    // Capacity for up to ~100 ms stereo lookahead (+ pad).
    overallBufferSize_ = static_cast<int>(srate_ * (100.f / 1000.f) * channels_) + channels_;
    buffer_.assign(static_cast<size_t>(overallBufferSize_), 0.f);
    ascPeak_.assign(static_cast<size_t>(overallBufferSize_ / channels_ + 2), 0.f);
    nextDelta_.assign(static_cast<size_t>(overallBufferSize_), 0.f);
    nextPos_.assign(static_cast<size_t>(overallBufferSize_), -1);
    pos_ = 0;
    hardReset();
  }

  void setParams(float limitLin, float attackMs, float releaseMs, float weight = 1.f,
                 bool autoRelease = false, float ascCoeff = 1.f)
  {
    const float newLimit = std::max(1.0e-6f, limitLin);
    const bool limitChanged = std::fabs(newLimit - limit_) > 1.0e-9f;
    limit_ = newLimit;
    attack_ = std::max(1.0e-4f, attackMs / 1000.f);
    release_ = std::max(1.0e-4f, releaseMs / 1000.f);
    autoRelease_ = autoRelease;
    ascCoeff_ = std::max(1.0e-6f, ascCoeff);
    weight_ = weight;
    if (limitChanged && autoRelease_)
      rebuildAscFromBuffer();
  }

  /** Soft ceiling width (dB), release hold (ms), transient/release emphasis 0…1. */
  void setDynamicsExtras(float kneeDb, float releaseHoldMs, float emphasis)
  {
    kneeDb_ = std::clamp(kneeDb, 0.f, 24.f);
    holdLen_ = static_cast<int>(
      std::max(0.f, releaseHoldMs) * 0.001f * static_cast<float>(srate_));
    if (holdLen_ <= 0)
      holdRemaining_ = 0;
    emphasis_ = std::clamp(emphasis, 0.f, 1.f);
  }

  void setCurve(LimitCurve c) { curve_ = c; }

  void setMulti(bool set) { useMulti_ = set; }

  void activate()
  {
    active_ = true;
    pos_ = 0;
  }

  void deactivate() { active_ = false; }

  /** Full reset (buffer clear) — used on SR / oversampling rebuild. */
  void hardReset()
  {
    lookFrames_ = lookFramesForAttack();
    xfFromFrames_ = lookFrames_;
    xfToFrames_ = lookFrames_;
    xfPos_ = 0;
    xfLen_ = 0;
    std::fill(buffer_.begin(), buffer_.end(), 0.f);
    clearPeakQueue();
    clearAsc();
    pos_ = 0;
    delta_ = 0.f;
    att_ = 1.f;
    attMax_ = 1.f;
    cleanL_ = 0.f;
    cleanR_ = 0.f;
    segStart_ = 1.f;
    segEnd_ = 1.f;
    segPos_ = 0;
    segLen_ = 1;
    sleeping_ = true;
    holdRemaining_ = 0;
  }

  /**
   * Soft lookahead change: keep a fixed ring, crossfade old→new read taps.
   * Avoids zipper noise from sample-step delay morphing.
   */
  void setLookaheadMs(float attackMs, bool hard = false)
  {
    attack_ = std::max(1.0e-4f, attackMs / 1000.f);
    const int want = lookFramesForAttack();
    if (hard || overallBufferSize_ < channels_)
    {
      lookFrames_ = want;
      xfFromFrames_ = want;
      xfToFrames_ = want;
      xfPos_ = 0;
      xfLen_ = 0;
      clearPeakQueue();
      if (pos_ >= overallBufferSize_)
        pos_ = 0;
      return;
    }

    if (want == xfToFrames_ && xfLen_ == 0 && want == lookFrames_)
      return;

    // If a fade is already running, continue from the current blend position.
    xfFromFrames_ = (xfLen_ > 0) ? currentLookFrames() : lookFrames_;
    xfToFrames_ = want;
    lookFrames_ = want;
    xfLen_ = std::max(1, static_cast<int>(srate_ * 0.02f)); // ~20 ms
    xfPos_ = 0;
    clearPeakQueue();
    if (att_ < 1.f)
      beginSegment(att_, 1.f, std::max(1, static_cast<int>(srate_ * release_)));
  }

  void resetAsc() { clearAsc(); }

  bool takeAsc()
  {
    if (!ascActive_)
      return false;
    ascActive_ = false;
    return true;
  }

  float takeAttenuation()
  {
    const float a = attMax_;
    attMax_ = 1.f;
    return a;
  }

  float attenuation() const { return att_; }

  /** Delayed audio before gain reduction (same tap as output when att == 1). */
  float cleanLeft() const { return cleanL_; }
  float cleanRight() const { return cleanR_; }

  /** Lookahead delay in (over)sampled frames — stable target (max while fading). */
  int latencyFrames() const
  {
    int f = lookFrames_;
    if (xfLen_ > 0)
      f = std::max(xfFromFrames_, xfToFrames_);
    return std::max(1, f);
  }

  bool isSleeping() const { return sleeping_; }

  int overallBufferSize() const { return overallBufferSize_; }

  void process(float& left, float& right, float* multiBuffer = nullptr)
  {
    if (overallBufferSize_ < channels_ || buffer_.empty())
    {
      left = 0.f;
      right = 0.f;
      cleanL_ = 0.f;
      cleanR_ = 0.f;
      return;
    }

    const float peakIn = std::fabs(left) > std::fabs(right) ? std::fabs(left) : std::fabs(right);
    const float multiCoeff = (useMulti_ && multiBuffer) ? multiBuffer[pos_] : 1.f;
    const float limitEff = limit_ * multiCoeff * weight_;
    const float wakeThresh = kneeFloor(limitEff);

    // Always feed the look-ahead ring (latency stays constant while sleeping).
    buffer_[static_cast<size_t>(pos_)] = left;
    buffer_[static_cast<size_t>(pos_ + 1)] = right;

    if (sleeping_ && peakIn <= wakeThresh && multiCoeff >= 1.f && xfLen_ <= 0)
    {
      const int inFrame = pos_ / channels_;
      ascPush(inFrame, 0.f);
      const int ri = readPosFor(lookFrames_);
      left = buffer_[static_cast<size_t>(ri)];
      right = buffer_[static_cast<size_t>(ri + 1)];
      cleanL_ = left;
      cleanR_ = right;
      ascPop(ri / channels_);
      att_ = 1.f;
      delta_ = 0.f;
      sanitizeDenormal(left);
      sanitizeDenormal(right);
      advancePos();
      return;
    }

    sleeping_ = false;
    processGain(left, right, multiBuffer, peakIn, multiCoeff, limitEff);

    if (att_ >= 0.9999f && nextLen_ <= 0 && !(delta_ < 0.f) && xfLen_ <= 0)
    {
      att_ = 1.f;
      delta_ = 0.f;
      sleeping_ = true;
    }

    sanitizeDenormal(left);
    sanitizeDenormal(right);
    sanitize(att_);
    sanitize(delta_);

    if (att_ < attMax_)
      attMax_ = att_;

    advancePos();
  }

private:
  int lookFramesForAttack() const
  {
    int frames = static_cast<int>(srate_ * attack_);
    if (frames < 1)
      frames = 1;
    const int maxFrames = std::max(1, overallBufferSize_ / channels_);
    if (frames > maxFrames)
      frames = maxFrames;
    return frames;
  }

  int ring() const { return overallBufferSize_; }

  int readPosFor(int lookFrames) const
  {
    const int lf = std::max(1, lookFrames);
    // Same timing as classic size=lf*ch ring: read sample written (lf-1) frames ago.
    return (pos_ - (lf - 1) * channels_ + ring()) % ring();
  }

  int currentLookFrames() const
  {
    if (xfLen_ <= 0)
      return lookFrames_;
    const float t = static_cast<float>(xfPos_) / static_cast<float>(xfLen_);
    return std::max(1, static_cast<int>(std::lround(
                        static_cast<float>(xfFromFrames_) +
                        (static_cast<float>(xfToFrames_ - xfFromFrames_) * t))));
  }

  int schedLookFrames() const
  {
    if (xfLen_ <= 0)
      return std::max(1, lookFrames_);
    return std::max(1, std::max(xfFromFrames_, xfToFrames_));
  }

  void advancePos() { pos_ = (pos_ + channels_) % ring(); }

  void clearPeakQueue()
  {
    nextLen_ = 0;
    nextIter_ = 0;
    delta_ = 0.f;
    if (!nextPos_.empty())
      nextPos_[0] = -1;
    segPos_ = 0;
    segLen_ = 1;
    segStart_ = att_;
    segEnd_ = att_;
  }

  void clearAsc()
  {
    ascSum_ = 0.f;
    ascCount_ = 0;
    ascActive_ = false;
    std::fill(ascPeak_.begin(), ascPeak_.end(), 0.f);
  }

  void rebuildAscFromBuffer()
  {
    clearAsc();
    const int look = schedLookFrames();
    if (!autoRelease_ || look < 1 || ring() < channels_)
      return;
    for (int f = 0; f < look; ++f)
    {
      const int idx = (pos_ - f * channels_ + ring()) % ring();
      const float p = std::fabs(buffer_[static_cast<size_t>(idx)]) >
                          std::fabs(buffer_[static_cast<size_t>(idx + 1)])
                        ? std::fabs(buffer_[static_cast<size_t>(idx)])
                        : std::fabs(buffer_[static_cast<size_t>(idx + 1)]);
      const float lim = kneeFloor(limit_ * weight_);
      const int frame = idx / channels_;
      if (p > lim)
        ascPush(frame, p);
      else if (frame >= 0 && frame < static_cast<int>(ascPeak_.size()))
        ascPeak_[static_cast<size_t>(frame)] = 0.f;
    }
  }

  void ascPush(int frame, float peak)
  {
    if (frame < 0 || frame >= static_cast<int>(ascPeak_.size()))
      return;
    const float old = ascPeak_[static_cast<size_t>(frame)];
    if (old > 0.f)
    {
      ascSum_ -= old;
      --ascCount_;
    }
    ascPeak_[static_cast<size_t>(frame)] = peak;
    if (peak > 0.f)
    {
      ascSum_ += peak;
      ++ascCount_;
    }
    if (ascCount_ < 0)
      ascCount_ = 0;
    if (!(ascSum_ > 0.f) || ascCount_ == 0)
    {
      ascSum_ = 0.f;
      ascCount_ = 0;
    }
  }

  void ascPop(int frame)
  {
    if (frame < 0 || frame >= static_cast<int>(ascPeak_.size()))
      return;
    const float old = ascPeak_[static_cast<size_t>(frame)];
    if (old > 0.f)
    {
      ascSum_ -= old;
      --ascCount_;
      ascPeak_[static_cast<size_t>(frame)] = 0.f;
    }
    if (ascCount_ < 0)
      ascCount_ = 0;
    if (!(ascSum_ > 0.f) || ascCount_ == 0)
    {
      ascSum_ = 0.f;
      ascCount_ = 0;
    }
  }

  static float shapeWeight(float t, LimitCurve curve)
  {
    t = std::clamp(t, 0.f, 1.f);
    switch (curve)
    {
      case LimitCurve::Log:
        // Ease-in (dB-like): slow start, catches the peak late/harder.
        return t * t;
      case LimitCurve::Cos:
        return 0.5f - 0.5f * std::cos(t * static_cast<float>(M_PI));
      case LimitCurve::Linear:
      default:
        return t;
    }
  }

  void beginSegment(float start, float end, int len)
  {
    segStart_ = start;
    segEnd_ = end;
    segLen_ = std::max(1, len);
    segPos_ = 0;
  }

  float stepSegment()
  {
    ++segPos_;
    const float t = static_cast<float>(segPos_) / static_cast<float>(segLen_);
    if (curve_ == LimitCurve::Log)
    {
      // Constant-dB interpolation between segment endpoints.
      const float s = std::max(segStart_, 1.0e-12f);
      const float e = std::max(segEnd_, 1.0e-12f);
      return dbToLin(linToDb(s) + (linToDb(e) - linToDb(s)) * std::clamp(t, 0.f, 1.f));
    }
    const float w = shapeWeight(t, curve_);
    return segStart_ + (segEnd_ - segStart_) * w;
  }

  float kneeFloor(float limitEff) const
  {
    if (kneeDb_ < 0.05f)
      return limitEff;
    return limitEff * dbToLin(-kneeDb_);
  }

  /** Needed linear attenuation for soft/hard ceiling (1 = none). */
  float needAttenuation(float peak, float limitEff) const
  {
    const float safePeak = std::max(peak, 1.0e-12f);
    if (kneeDb_ < 0.05f)
      return safePeak > limitEff ? std::min(limitEff / safePeak, 1.f) : 1.f;

    const float floor = kneeFloor(limitEff);
    if (safePeak <= floor)
      return 1.f;
    if (safePeak >= limitEff)
      return std::min(limitEff / safePeak, 1.f);

    // Smoothstep blend of output peak toward the ceiling inside the knee.
    float t = (safePeak - floor) / std::max(limitEff - floor, 1.0e-12f);
    t = t * t * (3.f - 2.f * t);
    const float outPeak = safePeak + (limitEff - safePeak) * t;
    return std::clamp(outPeak / safePeak, 0.f, 1.f);
  }

  float releaseScaleForPeak(float peak) const
  {
    if (emphasis_ < 0.01f)
      return 1.f;
    const float avg = (ascCount_ > 0 && ascSum_ > 1.0e-12f)
                        ? (ascSum_ / static_cast<float>(ascCount_))
                        : peak;
    const float crest = peak / std::max(avg, 1.0e-6f);
    // crest≫1 → transient → faster release; sustained → slower.
    const float t = std::clamp((crest - 1.f) / 2.f, 0.f, 1.f);
    const float fast = 1.f - 0.75f * emphasis_;
    const float slow = 1.f + 1.25f * emphasis_;
    return slow + (fast - slow) * t;
  }

  float getRDelta(float att, bool useAsc, float peakForEmphasis = 0.f)
  {
    const float rel =
      release_ * releaseScaleForPeak(peakForEmphasis > 0.f ? peakForEmphasis : limit_);
    float rDelta = (1.0f - att) / (static_cast<float>(srate_) * std::max(rel, 1.0e-4f));
    if (useAsc && autoRelease_ && ascCount_ > 0 && ascSum_ > 1.0e-12f)
    {
      const float aAtt =
        (limit_ * weight_) / (ascCoeff_ * ascSum_) * static_cast<float>(ascCount_);
      if (aAtt > att)
      {
        const float d =
          std::max((aAtt - att) / (static_cast<float>(srate_) * std::max(rel, 1.0e-4f)),
                   rDelta / 10.f);
        if (d < rDelta)
        {
          ascActive_ = true;
          rDelta = d;
        }
      }
    }
    return rDelta;
  }

  void readCrossfaded(float& left, float& right) 
  {
    const int riTo = readPosFor(xfLen_ > 0 ? xfToFrames_ : lookFrames_);
    left = buffer_[static_cast<size_t>(riTo)];
    right = buffer_[static_cast<size_t>(riTo + 1)];

    if (xfLen_ <= 0)
      return;

    const int riFrom = readPosFor(xfFromFrames_);
    const float l0 = buffer_[static_cast<size_t>(riFrom)];
    const float r0 = buffer_[static_cast<size_t>(riFrom + 1)];
    const float t =
      static_cast<float>(xfPos_) / static_cast<float>(std::max(1, xfLen_));
    // Equal-power fade old → new.
    const float a = std::sin(t * static_cast<float>(M_PI) * 0.5f);
    const float b = std::cos(t * static_cast<float>(M_PI) * 0.5f);
    left = l0 * b + left * a;
    right = r0 * b + right * a;

    if (++xfPos_ >= xfLen_)
    {
      lookFrames_ = xfToFrames_;
      xfFromFrames_ = xfToFrames_;
      xfLen_ = 0;
      xfPos_ = 0;
    }
  }

  void processGain(float& left, float& right, float* multiBuffer, float peak,
                   float multiCoeff, float limitEff)
  {
    const int inFrame = pos_ / channels_;
    const float floor = kneeFloor(limitEff);
    const int lookFrames = schedLookFrames();
    const int R = ring();

    if (autoRelease_ && peak > floor)
      ascPush(inFrame, peak);
    else
      ascPush(inFrame, 0.f);

    const float needAtt = needAttenuation(peak, limitEff);
    if (needAtt < 0.9999f || multiCoeff < 1.f)
    {
      const float rDelta = getRDelta(needAtt, false, peak);
      float d = (needAtt - att_) / static_cast<float>(lookFrames);

      if (d < delta_)
      {
        nextPos_[0] = pos_;
        nextPos_[1] = -1;
        nextDelta_[0] = rDelta;
        nextLen_ = 1;
        nextIter_ = 0;
        delta_ = d;
        beginSegment(att_, needAtt, lookFrames);
      }
      else
      {
        bool found = false;
        int i = 0;
        for (i = nextIter_; i < nextIter_ + nextLen_; ++i)
        {
          const int j = i % R;
          const int np = nextPos_[static_cast<size_t>(j)];
          if (np < 0)
            break;
          const float mc = (useMulti_ && multiBuffer) ? multiBuffer[np] : 1.f;
          const float bp = std::fabs(buffer_[static_cast<size_t>(np)]) >
                               std::fabs(buffer_[static_cast<size_t>(np + 1)])
                             ? std::fabs(buffer_[static_cast<size_t>(np)])
                             : std::fabs(buffer_[static_cast<size_t>(np + 1)]);
          const float safeBp = std::max(bp, 1.0e-12f);
          const int dist = ((R + pos_ - np) % R) / channels_;
          if (dist <= 0 || dist > lookFrames)
            continue;
          const float bpNeed = needAttenuation(safeBp, limit_ * mc * weight_);
          d = (needAtt - bpNeed) / static_cast<float>(dist);
          if (d < nextDelta_[static_cast<size_t>(j)])
          {
            nextDelta_[static_cast<size_t>(j)] = d;
            found = true;
            break;
          }
        }
        if (found)
        {
          nextLen_ = i - nextIter_ + 1;
          const int slot = (nextIter_ + nextLen_) % R;
          nextPos_[static_cast<size_t>(slot)] = pos_;
          nextDelta_[static_cast<size_t>(slot)] = rDelta;
          nextPos_[static_cast<size_t>((nextIter_ + nextLen_ + 1) % R)] = -1;
          ++nextLen_;
        }
      }
    }

    // Audio tap (crossfaded while look changes) — use target look for peak fire.
    const int riFire = readPosFor(lookFrames_);
    readCrossfaded(left, right);

    const float outPeak =
      std::fabs(left) > std::fabs(right) ? std::fabs(left) : std::fabs(right);
    const float outMulti =
      (useMulti_ && multiBuffer) ? multiBuffer[riFire] : 1.f;
    ascPop(riFire / channels_);

    // Release hold: freeze release after a peak; still allow deeper attack.
    // Keep planned delta_/segment — zeroing delta_ permanently stalls release.
    if (holdRemaining_ > 0)
    {
      --holdRemaining_;
      if (delta_ < 0.f)
      {
        if (segLen_ > 0 && segPos_ < segLen_)
          att_ = stepSegment();
        else
          att_ += delta_;
      }
    }
    else if (delta_ < 0.f && segLen_ > 0 && segPos_ < segLen_)
      att_ = stepSegment();
    else
      att_ += delta_;

    cleanL_ = left;
    cleanR_ = right;
    left *= att_;
    right *= att_;

    if (riFire == nextPos_[static_cast<size_t>(nextIter_)])
    {
      // Arm hold before release / next-peak approach.
      if (holdLen_ > 0)
        holdRemaining_ = holdLen_;

      if (autoRelease_)
      {
        const float rd = getRDelta(att_, true, outPeak);
        delta_ = rd;
        const int relFrames =
          std::max(1, static_cast<int>((1.f - att_) / std::max(rd, 1.0e-12f)));
        beginSegment(att_, 1.f, relFrames);
        if (nextLen_ > 1)
        {
          const int np = nextPos_[static_cast<size_t>((nextIter_ + 1) % R)];
          if (np >= 0)
          {
            const float npPeak =
              std::fabs(buffer_[static_cast<size_t>(np)]) >
                  std::fabs(buffer_[static_cast<size_t>(np + 1)])
                ? std::fabs(buffer_[static_cast<size_t>(np)])
                : std::fabs(buffer_[static_cast<size_t>(np + 1)]);
            const float npMulti = (useMulti_ && multiBuffer) ? multiBuffer[np] : 1.f;
            const int dist = ((R + np - riFire) % R) / channels_;
            if (dist > 0 && dist <= lookFrames)
            {
              const float npLim = limit_ * npMulti * weight_;
              const float npNeed = needAttenuation(npPeak, npLim);
              const float dNext = (npNeed - att_) / static_cast<float>(dist);
              if (dNext < delta_ || holdRemaining_ > 0)
              {
                delta_ = dNext;
                beginSegment(att_, npNeed, dist);
              }
            }
          }
        }
      }
      else
      {
        delta_ = nextDelta_[static_cast<size_t>(nextIter_)];
        att_ = needAttenuation(outPeak, limit_ * weight_ * outMulti);
        beginSegment(att_, 1.f, std::max(1, static_cast<int>(srate_ * release_)));
      }
      --nextLen_;
      nextPos_[static_cast<size_t>(nextIter_)] = -1;
      nextIter_ = (nextIter_ + 1) % R;
    }

    if (att_ > 1.0f)
    {
      att_ = 1.0f;
      delta_ = 0.0f;
      clearPeakQueue();
    }

    if (!(att_ > 0.f))
    {
      att_ = 1.0e-12f;
      delta_ = (1.0f - att_) / (static_cast<float>(srate_) * release_);
      beginSegment(att_, 1.f, std::max(1, static_cast<int>(srate_ * release_)));
    }

    if (att_ != 1.f && (1.f - att_) < 1.0e-12f)
      att_ = 1.f;
    if (delta_ != 0.f && std::fabs(delta_) < 1.0e-14f)
      delta_ = 0.f;
  }

  float limit_ = 1.f;
  float attack_ = 0.005f;
  float release_ = 0.05f;
  float weight_ = 1.f;
  uint32_t srate_ = 44100;
  float att_ = 1.f;
  float attMax_ = 1.f;
  float cleanL_ = 0.f;
  float cleanR_ = 0.f;
  int pos_ = 0;
  int lookFrames_ = 1;
  int xfFromFrames_ = 1;
  int xfToFrames_ = 1;
  int xfPos_ = 0;
  int xfLen_ = 0;
  int overallBufferSize_ = 0;
  bool active_ = false;
  bool autoRelease_ = false;
  bool ascActive_ = false;
  bool useMulti_ = false;
  bool sleeping_ = true;
  float delta_ = 0.f;
  int nextIter_ = 0;
  int nextLen_ = 0;
  float ascSum_ = 0.f;
  int ascCount_ = 0;
  float ascCoeff_ = 1.f;
  int channels_ = 2;
  LimitCurve curve_ = LimitCurve::Linear;
  float kneeDb_ = 0.f;
  float emphasis_ = 0.f;
  int holdLen_ = 0;
  int holdRemaining_ = 0;

  float segStart_ = 1.f;
  float segEnd_ = 1.f;
  int segPos_ = 0;
  int segLen_ = 1;

  std::vector<float> buffer_;
  std::vector<float> ascPeak_;
  std::vector<int> nextPos_;
  std::vector<float> nextDelta_;
};

} // namespace Dsp
} // namespace calfNXT
