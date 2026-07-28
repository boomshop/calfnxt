#pragma once

// Output-field telemetry for correlation meter + goniometer (not VST params).

#include <algorithm>
#include <cmath>
#include <cstring>
#include <vector>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace calfNXT {
namespace Dsp {

class StereoFieldTap
{
public:
  /** Max interleaved floats flushed to UI (~128 L/R pairs). */
  static constexpr int kMaxGonioFloats = 256;

  void reset()
  {
    ring_.assign(ring_.size(), 0.f);
    ringPos_ = 0;
    envelope_ = 0.25f;
    sumLr_ = sumL2_ = sumR2_ = 0.0;
    corr_ = 0.f;
    publishedCorr_ = 0.f;
    publishedGonio_.assign(static_cast<size_t>(kMaxGonioFloats), 0.f);
    publishedGonioN_ = 0;
  }

  /** Clear ring + publish empty display (e.g. plugin bypass). */
  void clearDisplay()
  {
    ring_.assign(ring_.size(), 0.f);
    ringPos_ = 0;
    envelope_ = 0.25f;
    sumLr_ = sumL2_ = sumR2_ = 0.0;
    corr_ = 0.f;
    publishedCorr_ = 0.f;
    publishedGonioN_ = 0;
  }

  void setSampleRate(double sr)
  {
    sampleRate_ = sr > 0.0 ? sr : 44100.0;
    // ~1/30 s of interleaved stereo (Calf analyzer convention).
    const int n = std::max(64, static_cast<int>(sampleRate_ / 30.0) * 2);
    ring_.assign(static_cast<size_t>(n), 0.f);
    ringPos_ = 0;
    // ~400 ms integration (classic meters ~300–600 ms) so the needle is calm.
    const double win = 0.4;
    corrCoeff_ = std::exp(-1.0 / (win * sampleRate_));
    // ~2 s envelope release to 1% (Calf-style).
    envRelease_ = static_cast<float>(
      std::exp(std::log(0.01) / (2000.0 * sampleRate_ * 0.001)));
    reset();
  }

  /** Call once per output sample (post all FX). */
  void process(float L, float R)
  {
    if (ring_.empty())
      return;

    // Correlation EMA of second-order moments.
    const double c = corrCoeff_;
    sumLr_ = c * sumLr_ + (1.0 - c) * static_cast<double>(L) * static_cast<double>(R);
    sumL2_ = c * sumL2_ + (1.0 - c) * static_cast<double>(L) * static_cast<double>(L);
    sumR2_ = c * sumR2_ + (1.0 - c) * static_cast<double>(R) * static_cast<double>(R);
    const double denom = std::sqrt(std::max(1.0e-20, sumL2_ * sumR2_));
    float corr = static_cast<float>(sumLr_ / denom);
    if (!std::isfinite(corr))
      corr = 0.f;
    corr_ = std::clamp(corr, -1.f, 1.f);

    // Envelope autoscale (Calf): attack instant, slow release.
    const float lemax = std::max(std::fabs(L), std::fabs(R)) * 1.41421356f;
    if (lemax >= envelope_)
      envelope_ = lemax;
    else
      envelope_ = envRelease_ * (envelope_ - lemax) + lemax;
    const float scale = 1.f / std::max(0.25f, envelope_);
    const float Ls = L * scale;
    const float Rs = R * scale;

    ring_[static_cast<size_t>(ringPos_)] = Ls;
    ring_[static_cast<size_t>(ringPos_ + 1)] = Rs;
    ringPos_ = (ringPos_ + 2) % static_cast<int>(ring_.size());
  }

  /** Snapshot for UI thread (call once per process block end is fine). */
  void publish()
  {
    publishedCorr_ = corr_;
    if (ring_.empty())
    {
      publishedGonioN_ = 0;
      return;
    }

    const int ringFloats = static_cast<int>(ring_.size());
    const int pairs = ringFloats / 2;
    const int maxPairs = kMaxGonioFloats / 2;
    const int outPairs = std::min(pairs, maxPairs);
    const int step = std::max(1, pairs / outPairs);

    int n = 0;
    for (int p = 0; p < outPairs; ++p)
    {
      const int srcPair = (p * step) % pairs;
      const int idx = (ringPos_ + srcPair * 2) % ringFloats;
      publishedGonio_[static_cast<size_t>(n++)] = ring_[static_cast<size_t>(idx)];
      publishedGonio_[static_cast<size_t>(n++)] =
        ring_[static_cast<size_t>((idx + 1) % ringFloats)];
    }
    publishedGonioN_ = n;
  }

  float takeCorrelation() const { return publishedCorr_; }

  /** Fill interleaved L/R (already envelope-scaled). Returns float count. */
  int takeGonio(float* out, int maxOut) const
  {
    if (!out || maxOut < 2 || publishedGonioN_ < 2)
      return 0;
    const int n = std::min(maxOut, publishedGonioN_);
    // Keep even count (pairs).
    const int even = n - (n % 2);
    std::memcpy(out, publishedGonio_.data(), static_cast<size_t>(even) * sizeof(float));
    return even;
  }

private:
  std::vector<float> ring_;
  int ringPos_ = 0;
  double sampleRate_ = 44100.0;
  double corrCoeff_ = 0.0;
  double sumLr_ = 0.0;
  double sumL2_ = 0.0;
  double sumR2_ = 0.0;
  float corr_ = 0.f;
  float envelope_ = 0.25f;
  float envRelease_ = 0.999f;

  float publishedCorr_ = 0.f;
  std::vector<float> publishedGonio_;
  int publishedGonioN_ = 0;
};

} // namespace Dsp
} // namespace calfNXT
