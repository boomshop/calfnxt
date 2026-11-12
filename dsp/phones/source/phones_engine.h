#pragma once

// Headphone crossfeed plus a shoebox around the stereo triangle.
//
// Geometry (metres, listener at the origin, facing +z), shared with
// ui/src/plugins/PhonesUI/phonesLayout.ts:
//   side gap  = 0.25 + 0.85 * Live
//   front gap = 0.30 + 0.50 * Live
//   back gap  = 0.40 + 1.10 * Live
//   half width = Distance * sin(Angle) + side gap
//   front z    = Distance * cos(Angle) + front gap
//   back z     = -back gap
// Angle is the half-angle of the triangle (20°…45°). Live also sets the
// decay target from 0.25 s to 0.45 s. Room only scales reflection gain.
//
// Crossfeed keeps a mono input flat when Room is 0: the low band is split
// between the near ear and a delayed far ear, and the near-ear low band is
// reduced by the same gain. Reflections are an additive room and do colour.

#include "biquad.h"
#include "delay_line.h"

namespace calfNXT {
namespace Phones {

struct PhonesTap
{
  int src = 0;
  float delayL = 1.f;
  float delayR = 1.f;
  float gainL = 0.f;
  float gainR = 0.f;
};

struct PhonesLayout
{
  float angleDeg = 30.f;
  float distanceM = 1.2f;
  float live = 0.f;
  float spkX = 0.6f;
  float spkZ = 1.039f;
  float halfWidth = 0.85f;
  float frontZ = 1.34f;
  float backZ = -0.4f;
  float lengthM = 1.74f;
  float widthM = 1.7f;
  float rt60 = 0.25f;
  float fcHz = 700.f;
  float gEff = 0.5f;
  float itdSamples = 12.f;
  float itdSec = 0.00026f;
  float combDelay1 = 100.f;
  float combDelay2 = 140.f;
  float combFb1 = 0.5f;
  float combFb2 = 0.5f;
  PhonesTap taps[8] {};
  int nTaps = 0;
};

PhonesLayout layoutFor(float angleDeg, float distanceM, float live, float sr);

class PhonesEngine
{
public:
  void setSampleRate(float sr);
  void reset(float amount, float angleDeg, float distanceM, float room, float live, float mono);
  void setTargets(float amount, float angleDeg, float distanceM, float room, float live, float mono);
  void process(float inL, float inR, float& outL, float& outR);
  void sanitizeBlock();

  const PhonesLayout& layout() const { return layout_; }

private:
  void snapSmoothers();
  void smooth();
  void rebuildLayout();

  float sr_ = 48000.f;
  float coeff_ = 0.001f;

  float amountT_ = 1.f;
  float angleT_ = 30.f;
  float distanceT_ = 1.2f;
  float roomT_ = 0.5f;
  float liveT_ = 0.f;
  float monoT_ = 0.f;

  float amount_ = 1.f;
  float angle_ = 30.f;
  float distance_ = 1.2f;
  float room_ = 0.5f;
  float live_ = 0.f;
  float mono_ = 0.f;

  float fcHz_ = -1.f;
  PhonesLayout layout_ {};

  Dsp::BiquadD1 lpL_;
  Dsp::BiquadD1 lpR_;
  Dsp::BiquadD1 hpL_;
  Dsp::BiquadD1 hpR_;
  Dsp::BiquadD1 toneL_;
  Dsp::BiquadD1 toneR_;
  Dsp::BiquadD1 combLpL_[2];
  Dsp::BiquadD1 combLpR_[2];

  Dsp::DelayLine<512> crossL_;
  Dsp::DelayLine<512> crossR_;
  Dsp::DelayLine<8192> reflL_;
  Dsp::DelayLine<8192> reflR_;
  Dsp::DelayLine<16384> combL_[2];
  Dsp::DelayLine<16384> combR_[2];
};

} // namespace Phones
} // namespace calfNXT
