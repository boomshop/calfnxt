#pragma once

// Headphone crossfeed plus a shoebox around the stereo triangle.
//
// Geometry (metres, listener at the origin, facing +z), shared with
// ui/src/widgets/PhonesPlan/phonesLayout.ts:
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
//
// Early taps are a shoebox image cloud (same rules as the Reverb early
// generator: order 1–3, excess path over the direct sound, polarity by
// order). Scatter only stirs that cloud and darkens the tail a little.
// The late tank stays a small-room decay; Live sets its length.

#include "biquad.h"
#include "delay_line.h"
#include "reverb_late.h"

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
  float scatter = 0.f;
  float roomDist = 1.f;
  float left = -0.85f;
  float right = 0.85f;
  float front = 1.34f;
  float back = -0.4f;
  PhonesTap taps[96] {};
  int nTaps = 0;
};

PhonesLayout layoutFor(float angleDeg, float distanceM, float live, float scatter, float sr);

class PhonesEngine
{
public:
  void setSampleRate(float sr);
  void reset(float amount, float angleDeg, float distanceM, float room, float live, float scatter, float mono);
  void setTargets(float amount, float angleDeg, float distanceM, float room, float live, float scatter, float mono);
  void process(float inL, float inR, float& outL, float& outR);
  void sanitizeBlock();

  const PhonesLayout& layout() const { return layout_; }

private:
  void snapSmoothers();
  void smooth();
  void updateDirect();
  void rebuildLayout();
  bool geometryStale() const;

  float sr_ = 48000.f;
  float coeff_ = 0.001f;

  float amountT_ = 1.f;
  float angleT_ = 30.f;
  float distanceT_ = 1.2f;
  float roomT_ = 0.5f;
  float liveT_ = 0.f;
  float scatterT_ = 0.4f;
  float monoT_ = 0.f;

  float amount_ = 1.f;
  float angle_ = 30.f;
  float distance_ = 1.2f;
  float room_ = 0.5f;
  float live_ = 0.f;
  float scatter_ = 0.4f;
  float mono_ = 0.f;

  float fcHz_ = -1.f;
  float roomLpHz_ = -1.f;
  int geoHold_ = 0;
  PhonesLayout layout_ {};

  Dsp::BiquadD1 lpL_;
  Dsp::BiquadD1 lpR_;
  Dsp::BiquadD1 hpL_;
  Dsp::BiquadD1 hpR_;
  Dsp::BiquadD1 toneL_;
  Dsp::BiquadD1 toneR_;

  Dsp::DelayLine<512> crossL_;
  Dsp::DelayLine<512> crossR_;
  Dsp::DelayLine<16384> reflL_;
  Dsp::DelayLine<16384> reflR_;
  Dsp::ReverbLate late_;
  Dsp::ReverbDiffuse diffuse_;
};

} // namespace Phones
} // namespace calfNXT
