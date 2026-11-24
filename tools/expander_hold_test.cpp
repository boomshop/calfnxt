// Hold must pause the close; Release then sets how fast the gain falls.
// g++ -std=c++20 -O2 -Icommon/dsp tools/expander_hold_test.cpp -o /tmp/expander_hold_test

#include "expander.h"

#include <cmath>
#include <cstdio>

namespace {

int fails = 0;

void expect(bool ok, const char* msg)
{
  if (!ok)
  {
    std::fprintf(stderr, "FAIL %s\n", msg);
    ++fails;
  }
}

struct Close {
  int unityMs = 0;
  int fallMs = 0;
};

Close measure(float holdMs, float release)
{
  constexpr float kSr = 48000.f;
  calfNXT::Dsp::GainExpansion gx;
  gx.setSampleRate(kSr);
  gx.setParams(1.f, release, holdMs, -20.f, -20.f, 20.f, 0.f, -60.f,
               calfNXT::Dsp::DetectorMode::Peak);

  const int nHot = static_cast<int>(kSr * 0.05f);
  const int nSil = static_cast<int>(kSr * 2.f);
  for (int i = 0; i < nHot; ++i)
    gx.processDetector(1.f, 1.f);

  int unity = 0;
  int fall = 0;
  bool falling = false;
  for (int i = 0; i < nSil; ++i)
  {
    const float g = gx.processDetector(0.f, 0.f);
    if (!falling)
    {
      if (g < 0.9f)
        falling = true;
      else
        ++unity;
    }
    if (falling)
    {
      ++fall;
      if (g < 0.0015f)
        break;
    }
  }
  Close c;
  c.unityMs = static_cast<int>(std::lround(1000.f * static_cast<float>(unity) / kSr));
  c.fallMs = static_cast<int>(std::lround(1000.f * static_cast<float>(fall) / kSr));
  std::printf("hold %.0f release %.0f → unity %d ms, fall %d ms\n",
              holdMs, release, c.unityMs, c.fallMs);
  return c;
}

} // namespace

int main()
{
  const Close none = measure(0.f, 200.f);
  const Close held = measure(200.f, 200.f);
  const Close slower = measure(200.f, 800.f);

  expect(held.unityMs > none.unityMs + 150, "hold delays the close");
  expect(held.unityMs > 170 && held.unityMs < 230, "200 ms hold stays open about 200 ms");
  expect(std::abs(slower.unityMs - held.unityMs) < 30, "release does not shorten the hold");
  expect(slower.fallMs > held.fallMs + 40, "release lengthens the fall after hold");

  if (fails)
  {
    std::fprintf(stderr, "%d checks failed\n", fails);
    return 1;
  }
  std::printf("ok\n");
  return 0;
}
