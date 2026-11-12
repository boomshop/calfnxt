#include "phones_engine.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Phones {

namespace {

constexpr float kEar = 0.0875f;
constexpr float kSound = 343.f;
constexpr float kPi = 3.14159265358979323846f;
constexpr int kReflMax = 8192 - 4;
constexpr int kCombMax = 16384 - 4;
constexpr float kEarlyTrim = 0.7f;
constexpr float kTailSend = 0.07f;

float clampf(float v, float lo, float hi)
{
  return std::max(lo, std::min(hi, v));
}

float hypot2(float x, float z)
{
  return std::sqrt(x * x + z * z);
}

void imageOf(float sx, float sz, int wall, float halfW, float frontZ, float backZ, float& ix, float& iz)
{
  switch (wall)
  {
    case 0:
      ix = -2.f * halfW - sx;
      iz = sz;
      break;
    case 1:
      ix = 2.f * halfW - sx;
      iz = sz;
      break;
    case 2:
      ix = sx;
      iz = 2.f * frontZ - sz;
      break;
    default:
      ix = sx;
      iz = 2.f * backZ - sz;
      break;
  }
}

float combFb(float delaySec, float rt60)
{
  const float rt = std::max(rt60, 0.05f);
  const float fb = std::pow(10.f, -3.f * delaySec / rt);
  return std::min(fb, 0.95f);
}

float approach(float cur, float target, float c)
{
  if (std::fabs(target - cur) < 1.0e-5f)
    return target;
  return cur + (target - cur) * c;
}

} // namespace

PhonesLayout layoutFor(float angleDeg, float distanceM, float live, float sr)
{
  PhonesLayout g;
  const float srUse = sr > 1.f ? sr : 48000.f;
  g.angleDeg = clampf(angleDeg, 20.f, 45.f);
  g.distanceM = clampf(distanceM, 0.5f, 4.f);
  g.live = clampf(live, 0.f, 1.f);

  const float th = g.angleDeg * (kPi / 180.f);
  const float sn = std::sin(th);
  const float cs = std::cos(th);
  g.spkX = g.distanceM * sn;
  g.spkZ = g.distanceM * cs;

  const float sideGap = 0.25f + 0.85f * g.live;
  const float frontGap = 0.30f + 0.50f * g.live;
  const float backGap = 0.40f + 1.10f * g.live;
  g.halfWidth = g.spkX + sideGap;
  g.frontZ = g.spkZ + frontGap;
  g.backZ = -backGap;
  g.widthM = 2.f * g.halfWidth;
  g.lengthM = g.frontZ - g.backZ;
  g.rt60 = 0.25f + 0.20f * g.live;

  const float u = (g.angleDeg - 20.f) / 25.f;
  const float share = 0.65f + (0.45f - 0.65f) * u;
  const float dNear = hypot2(-g.spkX + kEar, g.spkZ);
  const float dFar = hypot2(-g.spkX - kEar, g.spkZ);
  const float path = dNear / std::max(dFar, 1.0e-3f);
  g.gEff = share * path;
  g.itdSec = std::max(0.f, dFar - dNear) / kSound;
  g.itdSamples = clampf(g.itdSec * srUse, 1.f, 400.f);
  g.fcHz = 700.f * std::pow(30.f / g.angleDeg, 1.2f);

  const float refl = 0.18f + 0.16f * g.live;
  const float spkX[2] = {-g.spkX, g.spkX};
  const float ears[2] = {-kEar, kEar};
  g.nTaps = 0;
  for (int src = 0; src < 2; ++src)
  {
    for (int wall = 0; wall < 4; ++wall)
    {
      float ix = 0.f;
      float iz = 0.f;
      imageOf(spkX[src], g.spkZ, wall, g.halfWidth, g.frontZ, g.backZ, ix, iz);
      PhonesTap& tap = g.taps[g.nTaps++];
      tap.src = src;
      for (int ear = 0; ear < 2; ++ear)
      {
        const float dDirect = hypot2(spkX[src] - ears[ear], g.spkZ);
        const float dImage = std::max(0.05f, hypot2(ix - ears[ear], iz));
        float gain = kEarlyTrim * refl * (dDirect / dImage);
        gain = std::min(gain, 0.45f);
        const float delay = clampf(dImage / kSound * srUse, 1.f, float(kReflMax));
        if (ear == 0)
        {
          tap.gainL = gain;
          tap.delayL = delay;
        }
        else
        {
          tap.gainR = gain;
          tap.delayR = delay;
        }
      }
    }
  }

  const float d1 = clampf(g.lengthM / kSound * 0.85f, 0.008f, 0.055f);
  const float d2 = clampf(d1 * 1.37f, 0.010f, 0.070f);
  g.combDelay1 = clampf(d1 * srUse, 1.f, float(kCombMax));
  g.combDelay2 = clampf(d2 * srUse, 1.f, float(kCombMax));
  g.combFb1 = combFb(d1, g.rt60);
  g.combFb2 = combFb(d2, g.rt60);
  return g;
}

void PhonesEngine::setSampleRate(float sr)
{
  sr_ = sr > 1.f ? sr : 48000.f;
  coeff_ = 1.f - std::exp(-1.f / (sr_ * 0.03f));
  hpL_.setHp1(180.f, sr_);
  hpR_.setHp1(180.f, sr_);
  toneL_.setLp1(5500.f, sr_);
  toneR_.setLp1(5500.f, sr_);
  for (int i = 0; i < 2; ++i)
  {
    combLpL_[i].setLp1(4000.f, sr_);
    combLpR_[i].setLp1(4000.f, sr_);
  }
  fcHz_ = -1.f;
}

void PhonesEngine::snapSmoothers()
{
  amount_ = amountT_;
  angle_ = angleT_;
  distance_ = distanceT_;
  room_ = roomT_;
  live_ = liveT_;
  mono_ = monoT_;
}

void PhonesEngine::reset(float amount, float angleDeg, float distanceM, float room, float live, float mono)
{
  setTargets(amount, angleDeg, distanceM, room, live, mono);
  snapSmoothers();
  fcHz_ = -1.f;
  lpL_.reset();
  lpR_.reset();
  hpL_.reset();
  hpR_.reset();
  toneL_.reset();
  toneR_.reset();
  crossL_.reset();
  crossR_.reset();
  reflL_.reset();
  reflR_.reset();
  for (int i = 0; i < 2; ++i)
  {
    combLpL_[i].reset();
    combLpR_[i].reset();
    combL_[i].reset();
    combR_[i].reset();
  }
  rebuildLayout();
}

void PhonesEngine::setTargets(float amount, float angleDeg, float distanceM, float room, float live, float mono)
{
  amountT_ = clampf(amount, 0.f, 1.f);
  angleT_ = clampf(angleDeg, 20.f, 45.f);
  distanceT_ = clampf(distanceM, 0.5f, 4.f);
  roomT_ = clampf(room, 0.f, 1.f);
  liveT_ = clampf(live, 0.f, 1.f);
  monoT_ = clampf(mono, 0.f, 1.f);
}

void PhonesEngine::smooth()
{
  amount_ = approach(amount_, amountT_, coeff_);
  angle_ = approach(angle_, angleT_, coeff_);
  distance_ = approach(distance_, distanceT_, coeff_);
  room_ = approach(room_, roomT_, coeff_);
  live_ = approach(live_, liveT_, coeff_);
  mono_ = approach(mono_, monoT_, coeff_);
}

void PhonesEngine::rebuildLayout()
{
  layout_ = layoutFor(angle_, distance_, live_, sr_);
  if (std::fabs(layout_.fcHz - fcHz_) > 0.5f)
  {
    lpL_.setLp1(layout_.fcHz, sr_);
    lpR_.setLp1(layout_.fcHz, sr_);
    fcHz_ = layout_.fcHz;
  }
}

void PhonesEngine::sanitizeBlock()
{
  lpL_.sanitize();
  lpR_.sanitize();
  hpL_.sanitize();
  hpR_.sanitize();
  toneL_.sanitize();
  toneR_.sanitize();
  for (int i = 0; i < 2; ++i)
  {
    combLpL_[i].sanitize();
    combLpR_[i].sanitize();
  }
}

void PhonesEngine::process(float inL, float inR, float& outL, float& outR)
{
  smooth();
  if (fcHz_ < 0.f || angle_ != layout_.angleDeg || distance_ != layout_.distanceM || live_ != layout_.live)
    rebuildLayout();

  const float mid = 0.5f * (inL + inR);
  const float dryL = inL + mono_ * (mid - inL);
  const float dryR = inR + mono_ * (mid - inR);

  const float lpLv = static_cast<float>(lpL_.process(dryL));
  const float lpRv = static_cast<float>(lpR_.process(dryR));
  const float hpLv = dryL - lpLv;
  const float hpRv = dryR - lpRv;
  crossL_.write(lpLv);
  crossR_.write(lpRv);
  const float xL = crossR_.readLerp(layout_.itdSamples);
  const float xR = crossL_.readLerp(layout_.itdSamples);
  const float g = layout_.gEff;
  const float spL = hpLv + (1.f - g) * lpLv + g * xL;
  const float spR = hpRv + (1.f - g) * lpRv + g * xR;

  reflL_.write(dryL);
  reflR_.write(dryR);
  float accL = 0.f;
  float accR = 0.f;
  for (int i = 0; i < layout_.nTaps; ++i)
  {
    const PhonesTap& tap = layout_.taps[i];
    Dsp::DelayLine<8192>& line = tap.src == 0 ? reflL_ : reflR_;
    accL += tap.gainL * line.readLerp(tap.delayL);
    accR += tap.gainR * line.readLerp(tap.delayR);
  }

  const float delays[2] = {layout_.combDelay1, layout_.combDelay2};
  const float fbs[2] = {layout_.combFb1, layout_.combFb2};
  float tailL = 0.f;
  float tailR = 0.f;
  for (int i = 0; i < 2; ++i)
  {
    float dL = combL_[i].readLerp(delays[i]);
    float dR = combR_[i].readLerp(delays[i]);
    dL = static_cast<float>(combLpL_[i].process(dL));
    dR = static_cast<float>(combLpR_[i].process(dR));
    Dsp::sanitizeDenormal(dL);
    Dsp::sanitizeDenormal(dR);
    combL_[i].write(dryL * kTailSend + dL * fbs[i]);
    combR_[i].write(dryR * kTailSend + dR * fbs[i]);
    tailL += dL;
    tailR += dR;
  }

  float roomL = static_cast<float>(toneL_.process(hpL_.process(accL + tailL)));
  float roomR = static_cast<float>(toneR_.process(hpR_.process(accR + tailR)));
  Dsp::sanitizeDenormal(roomL);
  Dsp::sanitizeDenormal(roomR);

  const float earL = spL + room_ * roomL;
  const float earR = spR + room_ * roomR;
  outL = dryL + amount_ * (earL - dryL);
  outR = dryR + amount_ * (earR - dryR);
}

} // namespace Phones
} // namespace calfNXT
