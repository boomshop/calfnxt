#include "phones_engine.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>

namespace {

int fails = 0;

void expect(bool ok, const char* msg)
{
  if (ok)
    return;
  std::fprintf(stderr, "FAIL %s\n", msg);
  ++fails;
}

void expectNear(float got, float want, float tol, const char* msg)
{
  if (std::fabs(got - want) <= tol)
    return;
  std::fprintf(stderr, "FAIL %s (got %.6f want %.6f)\n", msg, got, want);
  ++fails;
}

} // namespace

int main()
{
  using namespace calfNXT::Phones;

  const auto lay = layoutFor(30.f, 1.2f, 0.f, 0.f, 48000.f);
  expectNear(lay.halfWidth, 0.85f, 1.0e-4f, "half width");
  expectNear(lay.frontZ, 1.2f * std::cos(30.f * 3.14159265f / 180.f) + 0.30f, 1.0e-4f, "front z");
  expectNear(lay.backZ, -0.40f, 1.0e-5f, "back z");
  expectNear(lay.rt60, 0.25f, 1.0e-5f, "rt60");
  expect(lay.itdSec > 0.00024f && lay.itdSec < 0.00028f, "itd at ±30°, 1.2 m");
  expect(lay.nTaps >= 8 && lay.nTaps <= 96, "early image cloud");

  const auto far = layoutFor(30.f, 4.f, 1.f, 1.f, 192000.f);
  float maxDelay = 0.f;
  for (int i = 0; i < far.nTaps; ++i)
  {
    maxDelay = std::max(maxDelay, far.taps[i].delayL);
    maxDelay = std::max(maxDelay, far.taps[i].delayR);
  }
  expect(maxDelay < 16384.f, "reflection delay fits the line at 192 kHz");
  expect(far.rt60 > 0.44f && far.rt60 < 0.46f, "live caps the decay");

  PhonesEngine dry;
  dry.setSampleRate(48000.f);
  dry.reset(0.f, 30.f, 1.2f, 1.f, 1.f, 0.f, 0.f);
  float oL = 0.f;
  float oR = 0.f;
  dry.process(0.5f, -0.25f, oL, oR);
  expectNear(oL, 0.5f, 1.0e-6f, "amount 0 keeps left");
  expectNear(oR, -0.25f, 1.0e-6f, "amount 0 keeps right");

  PhonesEngine mono;
  mono.setSampleRate(48000.f);
  mono.reset(0.f, 30.f, 1.2f, 0.f, 0.f, 0.f, 1.f);
  mono.process(1.f, 0.f, oL, oR);
  expectNear(oL, 0.5f, 1.0e-6f, "mono centre stays");
  expectNear(oR, 0.5f, 1.0e-6f, "mono copies both ears");

  constexpr int kSr = 48000;
  constexpr int kN = kSr / 2;
  constexpr int kSettle = kSr / 5;
  PhonesEngine cross;
  cross.setSampleRate(float(kSr));
  cross.reset(1.f, 30.f, 1.2f, 0.f, 0.f, 0.f, 0.f);
  double eL = 0.0;
  double eR = 0.0;
  double eIn = 0.0;
  double diff = 0.0;
  int n = 0;
  for (int i = 0; i < kN; ++i)
  {
    const float x = std::sin(2.0 * 3.141592653589793 * 40.0 * i / kSr);
    cross.process(x, x, oL, oR);
    if (i < kSettle)
      continue;
    eL += double(oL) * double(oL);
    eR += double(oR) * double(oR);
    eIn += double(x) * double(x);
    diff += double(oL - oR) * double(oL - oR);
    ++n;
  }
  const float rmsL = float(std::sqrt(eL / n));
  const float rmsR = float(std::sqrt(eR / n));
  const float rmsIn = float(std::sqrt(eIn / n));
  const float rmsDiff = float(std::sqrt(diff / n));
  const float dbL = 20.f * std::log10(rmsL / rmsIn);
  const float dbR = 20.f * std::log10(rmsR / rmsIn);
  std::printf("crossfeed 40 Hz: L %+.2f dB  R %+.2f dB  L-R rms %.2e\n", dbL, dbR, rmsDiff);
  expect(std::fabs(dbL) < 0.6f && std::fabs(dbR) < 0.6f, "mono bass stays within 0.6 dB");
  expect(rmsDiff < 1.0e-4f, "symmetric crossfeed matches both ears");

  PhonesEngine room;
  room.setSampleRate(float(kSr));
  room.reset(1.f, 30.f, 1.2f, 1.f, 0.4f, 0.f, 0.f);
  eL = 0.0;
  eR = 0.0;
  n = 0;
  for (int i = 0; i < kN; ++i)
  {
    const float x = 0.2f * std::sin(2.0 * 3.141592653589793 * 440.0 * i / kSr);
    room.process(x, x, oL, oR);
    if (i < kSettle)
      continue;
    eL += double(oL) * double(oL);
    eR += double(oR) * double(oR);
    ++n;
  }
  const float roomL = float(std::sqrt(eL / n));
  const float roomR = float(std::sqrt(eR / n));
  std::printf("room balance L %.4f R %.4f\n", roomL, roomR);
  // The small-room tail is decorrelated L/R, so a sine is not sample-symmetric.
  expect(std::fabs(roomL - roomR) / std::max(roomL, 1.0e-6f) < 0.55f, "centered room stays balanced");

  if (fails)
  {
    std::fprintf(stderr, "%d failed\n", fails);
    return 1;
  }
  std::puts("phones flatness ok");
  return 0;
}
