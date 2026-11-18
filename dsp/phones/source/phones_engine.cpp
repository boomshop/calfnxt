#include "phones_engine.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace calfNXT {
namespace Phones {

namespace {

constexpr float kEar = 0.0875f;
constexpr float kSound = 343.f;
constexpr float kPi = 3.14159265358979323846f;
constexpr int kReflMax = 16384 - 4;
constexpr int kTapMax = 96;
constexpr int kCandMax = 160;
constexpr float kEarY = 1.15f;
constexpr float kSpkY = 1.20f;
constexpr float kRoomH = 2.50f;
constexpr float kTailSend = 0.055f;

float clampf(float v, float lo, float hi)
{
  return std::max(lo, std::min(hi, v));
}

float hypot2(float x, float z)
{
  return std::sqrt(x * x + z * z);
}

float approach(float cur, float target, float c)
{
  if (std::fabs(target - cur) < 1.0e-5f)
    return target;
  return cur + (target - cur) * c;
}

float hypot3(float x, float y, float z)
{
  return std::sqrt(x * x + y * y + z * z);
}

/** Even n translates, odd n mirrors. Same rule as ReverbEr::imageAxis. */
float imageAxis(float s, float size, int n)
{
  if ((n & 1) == 0)
    return float(n) * size + s;
  return float(n) * size + (size - s);
}

float unitHash(int a, int b, int c, int d)
{
  uint32_t h = 2166136261u;
  h = (h ^ static_cast<uint32_t>(a)) * 16777619u;
  h = (h ^ static_cast<uint32_t>(b)) * 16777619u;
  h = (h ^ static_cast<uint32_t>(c)) * 16777619u;
  h = (h ^ static_cast<uint32_t>(d)) * 16777619u;
  return float(h & 0xFFFFFFu) / float(0x1000000u);
}

} // namespace

PhonesLayout layoutFor(float angleDeg, float distanceM, float live, float scatter, float sr)
{
  PhonesLayout g;
  const float srUse = sr > 1.f ? sr : 48000.f;
  g.angleDeg = clampf(angleDeg, 20.f, 45.f);
  g.distanceM = clampf(distanceM, 0.5f, 4.f);
  g.live = clampf(live, 0.f, 1.f);
  g.scatter = clampf(scatter, 0.f, 1.f);

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
  // Further speakers: the direct level stays put, the room sits louder against it.
  g.roomDist = clampf(0.45f + 0.55f * (g.distanceM / 1.2f), 0.45f, 1.75f);
  g.left = -g.halfWidth * (1.f + 0.08f * g.scatter);
  g.right = g.halfWidth * (1.f + 0.05f * g.scatter);
  g.front = g.frontZ + g.scatter * 0.06f * frontGap;
  g.back = g.backZ - g.scatter * 0.12f * backGap;

  const float u = (g.angleDeg - 20.f) / 25.f;
  const float share = 0.65f + (0.45f - 0.65f) * u;
  const float dNear = hypot2(-g.spkX + kEar, g.spkZ);
  const float dFar = hypot2(-g.spkX - kEar, g.spkZ);
  const float path = dNear / std::max(dFar, 1.0e-3f);
  g.gEff = share * path;
  g.itdSec = std::max(0.f, dFar - dNear) / kSound;
  g.itdSamples = clampf(g.itdSec * srUse, 1.f, 400.f);
  g.fcHz = 700.f * std::pow(30.f / g.angleDeg, 1.2f);

  struct Cand
  {
    int src = 0;
    float delayL = 1.f;
    float delayR = 1.f;
    float gainL = 0.f;
    float gainR = 0.f;
    float score = 0.f;
  };
  Cand cands[kCandMax];
  int nCand = 0;

  const float width = std::max(0.2f, g.right - g.left);
  const float length = std::max(0.2f, g.front - g.back);
  const float height = kRoomH + g.scatter * 0.30f;
  const float wall = 0.68f - 0.10f * g.scatter;
  const float earsX[2] = {-kEar, kEar};
  const float spkX[2] = {-g.spkX, g.spkX};

  for (int src = 0; src < 2; ++src)
  {
    const float sx = spkX[src] - g.left;
    const float sy = kSpkY;
    const float sz = g.spkZ - g.back;
    float dDirect[2];
    for (int ear = 0; ear < 2; ++ear)
      dDirect[ear] = hypot3(spkX[src] - earsX[ear], kSpkY - kEarY, g.spkZ);

    for (int nx = -3; nx <= 3; ++nx)
    {
      for (int ny = -3; ny <= 3; ++ny)
      {
        for (int nz = -3; nz <= 3; ++nz)
        {
          const int order = std::abs(nx) + std::abs(ny) + std::abs(nz);
          if (order < 1 || order > 3 || nCand >= kCandMax)
            continue;
          const float orderW = (order >= 3) ? (0.40f + 0.60f * g.scatter) : 1.f;
          if (orderW <= 1.0e-4f)
            continue;

          const float jx = (unitHash(src, nx, ny, nz) - 0.5f) * g.scatter * 0.08f;
          const float jy = (unitHash(src, ny, nz, nx) - 0.5f) * g.scatter * 0.05f;
          const float jz = (unitHash(nz, src, nx, ny) - 0.5f) * g.scatter * 0.08f;
          const float ix = g.left + imageAxis(sx, width, nx) + jx;
          const float iy = imageAxis(sy, height, ny) + jy;
          const float iz = g.back + imageAxis(sz, length, nz) + jz;

          float delay[2];
          float gain[2];
          float score = 0.f;
          bool keep = true;
          const float refl = std::pow(wall, float(order)) * orderW;
          const float sign = (order & 1) ? -1.f : 1.f;
          for (int ear = 0; ear < 2; ++ear)
          {
            const float dImage = std::max(0.05f, hypot3(ix - earsX[ear], iy - kEarY, iz));
            const float excess = dImage - dDirect[ear];
            const float excessSec = excess / kSound;
            if (excessSec < 0.0004f || excessSec > 0.030f)
            {
              keep = false;
              break;
            }
            const float air = std::exp(-excessSec * (8.f + 6.f * g.scatter));
            delay[ear] = clampf(excessSec * srUse, 1.f, float(kReflMax));
            gain[ear] = sign * std::min(refl * air * (dDirect[ear] / dImage), 0.35f);
            score += std::fabs(gain[ear]);
          }
          if (!keep || !(score > 0.f))
            continue;
          Cand& c = cands[nCand++];
          c.src = src;
          c.delayL = delay[0];
          c.delayR = delay[1];
          c.gainL = gain[0];
          c.gainR = gain[1];
          c.score = score;
        }
      }
    }
  }

  const int want = std::min(kTapMax, 44 + static_cast<int>(g.scatter * 28.f + 0.5f));
  if (nCand > want)
  {
    std::nth_element(cands, cands + want, cands + nCand,
                     [](const Cand& a, const Cand& b) { return a.score > b.score; });
    nCand = want;
  }
  float peak = 1.0e-6f;
  for (int i = 0; i < nCand; ++i)
    peak = std::max(peak, std::fabs(cands[i].gainL) + std::fabs(cands[i].gainR));
  const float norm = 0.28f / peak;
  g.nTaps = nCand;
  for (int i = 0; i < nCand; ++i)
  {
    g.taps[i].src = cands[i].src;
    g.taps[i].delayL = cands[i].delayL;
    g.taps[i].delayR = cands[i].delayR;
    g.taps[i].gainL = cands[i].gainL * norm;
    g.taps[i].gainR = cands[i].gainR * norm;
  }
  return g;
}

void PhonesEngine::setSampleRate(float sr)
{
  sr_ = sr > 1.f ? sr : 48000.f;
  coeff_ = 1.f - std::exp(-1.f / (sr_ * 0.03f));
  hpL_.setHp1(200.f, sr_);
  hpR_.setHp1(200.f, sr_);
  toneL_.setLp1(3600.f, sr_);
  toneR_.setLp1(3600.f, sr_);
  late_.setup(sr_);
  diffuse_.setup(sr_);
  fcHz_ = -1.f;
  roomLpHz_ = -1.f;
}

void PhonesEngine::snapSmoothers()
{
  amount_ = amountT_;
  angle_ = angleT_;
  distance_ = distanceT_;
  room_ = roomT_;
  live_ = liveT_;
  scatter_ = scatterT_;
  mono_ = monoT_;
}

void PhonesEngine::reset(float amount, float angleDeg, float distanceM, float room, float live, float scatter, float mono)
{
  setTargets(amount, angleDeg, distanceM, room, live, scatter, mono);
  snapSmoothers();
  fcHz_ = -1.f;
  roomLpHz_ = -1.f;
  geoHold_ = 0;
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
  late_.reset();
  diffuse_.reset();
  rebuildLayout();
}

void PhonesEngine::setTargets(float amount, float angleDeg, float distanceM, float room, float live, float scatter, float mono)
{
  amountT_ = clampf(amount, 0.f, 1.f);
  angleT_ = clampf(angleDeg, 20.f, 45.f);
  distanceT_ = clampf(distanceM, 0.5f, 4.f);
  roomT_ = clampf(room, 0.f, 1.f);
  liveT_ = clampf(live, 0.f, 1.f);
  scatterT_ = clampf(scatter, 0.f, 1.f);
  monoT_ = clampf(mono, 0.f, 1.f);
}

void PhonesEngine::smooth()
{
  amount_ = approach(amount_, amountT_, coeff_);
  angle_ = approach(angle_, angleT_, coeff_);
  distance_ = approach(distance_, distanceT_, coeff_);
  room_ = approach(room_, roomT_, coeff_);
  live_ = approach(live_, liveT_, coeff_);
  scatter_ = approach(scatter_, scatterT_, coeff_);
  mono_ = approach(mono_, monoT_, coeff_);
}

void PhonesEngine::updateDirect()
{
  const float angle = clampf(angle_, 20.f, 45.f);
  const float dist = clampf(distance_, 0.5f, 4.f);
  const float th = angle * (kPi / 180.f);
  const float spkX = dist * std::sin(th);
  const float spkZ = dist * std::cos(th);
  const float u = (angle - 20.f) / 25.f;
  const float share = 0.65f + (0.45f - 0.65f) * u;
  const float dNear = hypot2(-spkX + kEar, spkZ);
  const float dFar = hypot2(-spkX - kEar, spkZ);
  layout_.gEff = share * (dNear / std::max(dFar, 1.0e-3f));
  layout_.itdSamples = clampf(std::max(0.f, dFar - dNear) / kSound * sr_, 1.f, 400.f);
  layout_.roomDist = clampf(0.45f + 0.55f * (dist / 1.2f), 0.45f, 1.75f);
  const float fc = 700.f * std::pow(30.f / angle, 1.2f);
  if (std::fabs(fc - fcHz_) > 0.5f)
  {
    lpL_.setLp1(fc, sr_);
    lpR_.setLp1(fc, sr_);
    fcHz_ = fc;
  }
}

bool PhonesEngine::geometryStale() const
{
  return std::fabs(angle_ - layout_.angleDeg) > 1.0e-3f
      || std::fabs(distance_ - layout_.distanceM) > 1.0e-4f
      || std::fabs(live_ - layout_.live) > 1.0e-4f
      || std::fabs(scatter_ - layout_.scatter) > 1.0e-4f;
}

void PhonesEngine::rebuildLayout()
{
  layout_ = layoutFor(angle_, distance_, live_, scatter_, sr_);
  if (std::fabs(layout_.fcHz - fcHz_) > 0.5f)
  {
    lpL_.setLp1(layout_.fcHz, sr_);
    lpR_.setLp1(layout_.fcHz, sr_);
    fcHz_ = layout_.fcHz;
  }
  const float lpHz = 3200.f - 700.f * layout_.scatter;
  if (std::fabs(lpHz - roomLpHz_) > 1.f)
  {
    toneL_.setLp1(lpHz, sr_);
    toneR_.setLp1(lpHz, sr_);
    roomLpHz_ = lpHz;
  }
  // Tank stays a small-room tail. Scatter must not stretch it into a hall,
  // and Distance already raises the room level via roomDist.
  late_.setRoomSizeM(2.5f);
  late_.setTime(layout_.rt60);
  late_.setDiffusion(0.48f + 0.14f * layout_.scatter);
  late_.setCutoff(lpHz);
  late_.setLfDamp(0.18f + 0.10f * layout_.scatter);
  late_.setDistance(0.f);
  late_.setMod(0.12f, 0.04f + 0.06f * layout_.scatter);
  late_.setActiveStages(4);
  diffuse_.setStages(4);
}

void PhonesEngine::sanitizeBlock()
{
  lpL_.sanitize();
  lpR_.sanitize();
  hpL_.sanitize();
  hpR_.sanitize();
  toneL_.sanitize();
  toneR_.sanitize();
}

void PhonesEngine::process(float inL, float inR, float& outL, float& outR)
{
  smooth();
  // The image cloud is rebuilt a few times a second. Doing it per sample
  // while a knob glides starves the audio thread and the sound drops out.
  updateDirect();
  if (fcHz_ < 0.f || geometryStale())
  {
    if (geoHold_ <= 0)
    {
      rebuildLayout();
      geoHold_ = static_cast<int>(sr_ * 0.025f);
    }
    else
      --geoHold_;
  }
  else
    geoHold_ = 0;

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
    Dsp::DelayLine<16384>& line = tap.src == 0 ? reflL_ : reflR_;
    accL += tap.gainL * line.readLerp(tap.delayL);
    accR += tap.gainR * line.readLerp(tap.delayR);
  }
  diffuse_.process(accL, accR, 0.08f + 0.14f * layout_.scatter);

  float tailL = dryL * kTailSend;
  float tailR = dryR * kTailSend;
  late_.process(tailL, tailR);

  float roomL = static_cast<float>(toneL_.process(hpL_.process(accL + tailL)));
  float roomR = static_cast<float>(toneR_.process(hpR_.process(accR + tailR)));
  Dsp::sanitizeDenormal(roomL);
  Dsp::sanitizeDenormal(roomR);

  const float roomSend = room_ * layout_.roomDist;
  const float earL = spL + roomSend * roomL;
  const float earR = spR + roomSend * roomR;
  outL = dryL + amount_ * (earL - dryL);
  outR = dryR + amount_ * (earR - dryR);
}

} // namespace Phones
} // namespace calfNXT
