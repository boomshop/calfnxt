#pragma once

// De-esser detection chain: multi-slope HP (12/24/48 via cascaded RBJ) + peaking.
// HP Q is applied equally on every stage (EQ-style resonance at fc).
// Audio split uses BandSplitter LR Qs separately — detection is not complementary.

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
    float hpHz,
    float hpQ,
    float peakHz,
    float peakGainDb,
    float peakQ,
    BandSplitter::Slope slope)
  {
    hpHz_ = hpHz;
    hpQ_ = hpQ;
    peakHz_ = peakHz;
    peakGainDb_ = peakGainDb;
    peakQ_ = peakQ;
    if (slope != slope_)
    {
      slope_ = slope;
      dirty_ = true;
    }
    dirty_ = true;
  }

  void prepareBlock()
  {
    if (dirty_)
      updateCoeffs();
  }

  /** HP (resonant) → peaking. Returns detector sample for one channel. */
  float processChannel(int ch, float x)
  {
    if (dirty_)
      updateCoeffs();

    BiquadD1* hp = ch == 0 ? hpL_ : hpR_;
    BiquadD1& peak = ch == 0 ? peakL_ : peakR_;

    double y = x;
    for (int s = 0; s < stages_; ++s)
    {
      y = hp[s].process(y);
      hp[s].sanitize();
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
    const float hpFc = std::clamp(hpHz_, 20.f, ny);
    const float pkFc = std::clamp(peakHz_, 20.f, ny);
    const float qHp = std::clamp(hpQ_, 0.1f, 100.f);
    const float qPk = std::clamp(peakQ_, 0.1f, 100.f);
    const float peakLin = dbToLin(std::clamp(peakGainDb_, -24.f, 24.f));

    for (int s = 0; s < stages_; ++s)
    {
      hpL_[s].setHpRbj(hpFc, qHp, sr_);
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
  float hpHz_ = 6000.f;
  float hpQ_ = 0.707f;
  float peakHz_ = 4500.f;
  float peakGainDb_ = 12.f;
  float peakQ_ = 1.f;
  BandSplitter::Slope slope_ = BandSplitter::Slope::Db24;
  int stages_ = 2;
  bool dirty_ = true;
};

} // namespace Dsp
} // namespace calfNXT
