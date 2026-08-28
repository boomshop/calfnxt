#pragma once

// In-place radix-2 complex FFT (float). No heap allocation — caller owns buffers.
// n must be a power of two in [2, 8192].

#include "dsp_math.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace calfNXT {
namespace Dsp {

inline bool isPowerOfTwo(int n)
{
  return n >= 2 && (n & (n - 1)) == 0;
}

/** Bit-reverse permutation of re/im arrays of length n. */
inline void fftBitReverse(float* re, float* im, int n)
{
  int j = 0;
  for (int i = 1; i < n; ++i)
  {
    int bit = n >> 1;
    for (; j & bit; bit >>= 1)
      j ^= bit;
    j ^= bit;
    if (i < j)
    {
      std::swap(re[i], re[j]);
      std::swap(im[i], im[j]);
    }
  }
}

/**
 * Forward complex DFT in-place (Cooley–Tukey).
 * Input/output: re[i] + j*im[i], length n (power of two).
 */
inline void fftRadix2(float* re, float* im, int n)
{
  if (!isPowerOfTwo(n) || !re || !im)
    return;

  fftBitReverse(re, im, n);

  for (int len = 2; len <= n; len <<= 1)
  {
    const float ang = static_cast<float>(-2.0 * M_PI / static_cast<double>(len));
    const float wlenRe = std::cos(ang);
    const float wlenIm = std::sin(ang);
    for (int i = 0; i < n; i += len)
    {
      float wRe = 1.f;
      float wIm = 0.f;
      const int half = len >> 1;
      for (int j = 0; j < half; ++j)
      {
        const int u = i + j;
        const int v = u + half;
        const float tRe = wRe * re[v] - wIm * im[v];
        const float tIm = wRe * im[v] + wIm * re[v];
        re[v] = re[u] - tRe;
        im[v] = im[u] - tIm;
        re[u] += tRe;
        im[u] += tIm;
        const float nwRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nwRe;
      }
    }
  }
}

/** Inverse DFT in-place (conjugate → forward FFT → conjugate / n). */
inline void ifftRadix2(float* re, float* im, int n)
{
  if (!isPowerOfTwo(n) || !re || !im)
    return;
  for (int i = 0; i < n; ++i)
    im[i] = -im[i];
  fftRadix2(re, im, n);
  const float s = 1.f / static_cast<float>(n);
  for (int i = 0; i < n; ++i)
  {
    re[i] *= s;
    im[i] = -im[i] * s;
  }
}

/** Magnitude in linear amplitude for bin k (0…n/2). */
inline float fftBinMag(const float* re, const float* im, int k)
{
  const float r = re[k];
  const float i = im[k];
  return std::sqrt(r * r + i * i);
}

} // namespace Dsp
} // namespace calfNXT
