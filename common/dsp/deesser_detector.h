#pragma once

// De-esser detection chain: multi-slope HP or LP (12/24/48 via cascaded RBJ) + peaking.
// Cutoff Q is applied equally on every stage (EQ-style resonance at fc).
// Audio split uses BandSplitter LR Qs separately — detection is not complementary.
// Target Ess = high-pass focus; Target Rumble = low-pass focus (same fc / Q / peak).

#include "band_splitter.h"
#include "biquad.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Dsp {

class DeesserDetector
{
public:
  static constexpr int kMaxStages = BandSplitter::kMaxStages;

  void reset()
  {
    for (int s = 0; s < kMaxStages; ++s)
    {
      hpL_[s].reset();
      hpR_[s].reset();
    }
    peakL_.reset();
    peakR_.reset();
  }

  void setSampleRate(float sr)
  {
    const float s = sr > 0.f ? sr : 44100.f;
    if (s == sr_)
      return;
    sr_ = s;
    dirty_ = true;
  }

  void setParams(
    float cutoffHz,
    float cutoffQ,
    float peakHz,
    float peakGainDb,
    float peakQ,
    BandSplitter::Slope slope,
    bool lowpass)
  {
    cutoffHz_ = cutoffHz;
    cutoffQ_ = cutoffQ;
    peakHz_ = peakHz;
    peakGainDb_ = peakGainDb;
    peakQ_ = peakQ;
    if (slope != slope_ || lowpass != lowpass_)
    {
      slope_ = slope;
      lowpass_ = lowpass;
      dirty_ = true;
    }
    dirty_ = true;
  }

  void prepareBlock()
  {
    if (dirty_)
      updateCoeffs();
  }

  /** Cutoff (resonant HP or LP) → peaking. Returns detector sample for one channel. */
  float processChannel(int ch, float x)
  {
    if (dirty_)
      updateCoeffs();

    BiquadD1* stages = ch == 0 ? hpL_ : hpR_;
    BiquadD1& peak = ch == 0 ? peakL_ : peakR_;

    double y = x;
    for (int s = 0; s < stages_; ++s)
    {
      y = stages[s].process(y);
      stages[s].sanitize();
    }
    y = peak.process(y);
    peak.sanitize();
    return static_cast<float>(y);
  }

  void processStereo(float L, float R, float& detL, float& detR)
  {
    detL = processChannel(0, L);
    detR = processChannel(1, R);
  }

private:
  int stageCount() const
  {
    switch (slope_)
    {
      case BandSplitter::Slope::Db12:
        return 1;
      case BandSplitter::Slope::Db24:
        return 2;
      case BandSplitter::Slope::Db48:
        return 4;
    }
    return 2;
  }

  void updateCoeffs()
  {
    if (sr_ <= 0.f)
      return;

    stages_ = stageCount();
    const float ny = sr_ * 0.45f;
    const float fc = std::clamp(cutoffHz_, 20.f, ny);
    const float pkFc = std::clamp(peakHz_, 20.f, ny);
    const float qCut = std::clamp(cutoffQ_, 0.1f, 100.f);
    const float qPk = std::clamp(peakQ_, 0.1f, 100.f);
    const float peakLin = dbToLin(std::clamp(peakGainDb_, -24.f, 24.f));

    for (int s = 0; s < stages_; ++s)
    {
      if (lowpass_)
        hpL_[s].setLpRbj(fc, qCut, sr_);
      else
        hpL_[s].setHpRbj(fc, qCut, sr_);
      hpR_[s].copyCoeffs(hpL_[s]);
    }
    for (int s = stages_; s < kMaxStages; ++s)
    {
      hpL_[s].setNull();
      hpR_[s].setNull();
      hpL_[s].reset();
      hpR_[s].reset();
    }

    peakL_.setPeakeqRbj(pkFc, qPk, peakLin, sr_);
    peakR_.copyCoeffs(peakL_);
    dirty_ = false;
  }

  BiquadD1 hpL_[kMaxStages];
  BiquadD1 hpR_[kMaxStages];
  BiquadD1 peakL_;
  BiquadD1 peakR_;
  float sr_ = 44100.f;
  float cutoffHz_ = 4000.f;
  float cutoffQ_ = 0.707f;
  float peakHz_ = 4500.f;
  float peakGainDb_ = 12.f;
  float peakQ_ = 1.f;
  BandSplitter::Slope slope_ = BandSplitter::Slope::Db24;
  int stages_ = 2;
  bool lowpass_ = false;
  bool dirty_ = true;
};

} // namespace Dsp
} // namespace calfNXT
