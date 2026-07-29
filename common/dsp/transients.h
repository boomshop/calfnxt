#pragma once

#include "dsp_math.h"

#include <algorithm>
#include <cmath>
#include <vector>

namespace calfNXT {
namespace Dsp {

/**
 * Calf-style transient shaper core (lookahead + attack/release envelope shaping).
 * Ported into a small standalone class so plugins can reuse it without the old GUI code.
 */
class Transients
{
public:
  static constexpr int kMaxChannels = 2;
  static constexpr int kMaxLookaheadSamples = 100;

  void setChannels(int ch)
  {
    channels_ = std::clamp(ch, 1, kMaxChannels);
    lookBuf_.assign(static_cast<size_t>((kMaxLookaheadSamples + 1) * channels_), 0.f);
    lookPos_ = 0;
    resetState();
  }

  void setSampleRate(double sr)
  {
    sampleRate_ = sr > 0.0 ? sr : 44100.0;
    attackCoef_ = static_cast<float>(
      std::exp(std::log(0.01) / (0.001 * sampleRate_)));
    releaseCoef_ = static_cast<float>(
      std::exp(std::log(0.01) / (0.2 * sampleRate_)));
    maxDelta_ = static_cast<float>(std::pow(4.0, 1.0 / (0.001 * sampleRate_)));
    calcRelFac();
    resetState();
  }

  void resetState()
  {
    envelope_ = 0.f;
    attack_ = 0.f;
    release_ = 0.f;
    newReturn_ = 1.f;
    oldReturn_ = 1.f;
    sustainEnded_ = false;
    lookPos_ = 0;
    for (float& v : lookBuf_)
      v = 0.f;
  }

  void setParams(float attackTimeMs, float attackBoost, float releaseTimeMs,
                 float releaseBoost, float sustainThreshold, int lookaheadSamples)
  {
    attackTimeMs_ = std::max(0.001f, attackTimeMs);
    releaseTimeMs_ = std::max(0.001f, releaseTimeMs);
    sustainThreshold_ = std::max(1.0e-6f, sustainThreshold);
    lookaheadSamples_ = std::clamp(lookaheadSamples, 0, kMaxLookaheadSamples);
    attackLevel_ = attackBoost > 0.f ? 0.25f * std::pow(attackBoost * 8.f, 2.f)
                                     : -0.25f * std::pow(attackBoost * 4.f, 2.f);
    releaseLevel_ = releaseBoost > 0.f ? 0.5f * std::pow(releaseBoost * 8.f, 2.f)
                                       : -0.25f * std::pow(releaseBoost * 4.f, 2.f);
    calcRelFac();
  }

  bool isNeutral() const
  {
    return std::fabs(attackLevel_) <= 1.0e-6f && std::fabs(releaseLevel_) <= 1.0e-6f;
  }

  void processFrame(float* io, float detector)
  {
    if (!io || lookBuf_.empty())
      return;

    const float s = std::fabs(detector);
    for (int ch = 0; ch < channels_; ++ch)
      lookBuf_[static_cast<size_t>(lookPos_ + ch)] = io[ch];

    if (s > envelope_)
      envelope_ = attackCoef_ * (envelope_ - s) + s;
    else
      envelope_ = releaseCoef_ * (envelope_ - s) + s;

    const double attDelta = (envelope_ - attack_) * 0.707 /
      (sampleRate_ * attackTimeMs_ * 0.001);
    if (sustainEnded_ && attack_ > 1.0e-9f && envelope_ / attack_ - 1.f > 0.2f)
      sustainEnded_ = false;
    attack_ += static_cast<float>(attDelta);
    attack_ = std::min(envelope_, attack_);

    if (!sustainEnded_)
    {
      const float relRef = std::max(release_, 1.0e-12f);
      if (envelope_ / relRef < sustainThreshold_)
        sustainEnded_ = true;
    }

    release_ *= sustainEnded_ ? relFac_ : 1.f;
    release_ = std::max(envelope_, release_);

    const double attDiff = attack_ > 1.0e-12f ? std::log(envelope_ / attack_) : 0.0;
    const double relDiff = envelope_ > 1.0e-12f ? std::log(release_ / envelope_) : 0.0;
    const double ampFactor = attDiff * attackLevel_ + relDiff * releaseLevel_;

    oldReturn_ = newReturn_;
    newReturn_ = static_cast<float>(
      1.0 + (ampFactor < 0.0
        ? std::max(-1.0 + 1.0e-15, std::exp(ampFactor) - 1.0)
        : ampFactor));

    const float ratio = oldReturn_ > 1.0e-12f ? newReturn_ / oldReturn_ : 1.f;
    if (ratio > maxDelta_)
      newReturn_ = oldReturn_ * maxDelta_;
    else if (ratio < 1.f / maxDelta_)
      newReturn_ = oldReturn_ / maxDelta_;

    const int span = static_cast<int>(lookBuf_.size());
    const int pos = (lookPos_ + span - lookaheadSamples_ * channels_) % span;
    for (int ch = 0; ch < channels_; ++ch)
      io[ch] = lookBuf_[static_cast<size_t>(pos + ch)] * newReturn_;

    lookPos_ = (lookPos_ + channels_) % span;

    sanitizeDenormal(envelope_);
    sanitizeDenormal(attack_);
    sanitizeDenormal(release_);
    sanitizeDenormal(newReturn_);
    sanitizeDenormal(oldReturn_);
  }

  float envelope() const { return envelope_; }
  float attack() const { return attack_; }
  float release() const { return release_; }

private:
  void calcRelFac()
  {
    relFac_ = static_cast<float>(
      std::pow(0.5, 1.0 / (0.001 * std::max(0.001f, releaseTimeMs_) * sampleRate_)));
  }

  int channels_ = kMaxChannels;
  double sampleRate_ = 44100.0;
  std::vector<float> lookBuf_;
  int lookPos_ = 0;
  int lookaheadSamples_ = 0;

  float envelope_ = 0.f;
  float attack_ = 0.f;
  float release_ = 0.f;
  float attackCoef_ = 0.f;
  float releaseCoef_ = 0.f;
  float attackTimeMs_ = 30.f;
  float attackLevel_ = 0.f;
  float releaseTimeMs_ = 300.f;
  float releaseLevel_ = 0.f;
  float sustainThreshold_ = 1.f;
  float relFac_ = 1.f;
  float maxDelta_ = 1.f;
  float newReturn_ = 1.f;
  float oldReturn_ = 1.f;
  bool sustainEnded_ = false;
};

} // namespace Dsp
} // namespace calfNXT
