#pragma once

// Early reflections from a shoebox image-source model (shared mono source → L/R taps).
// roomM = longest horizontal dimension (length) in meters — not radius/diameter.
// Orders 1–3 (feedforward); Multi-Tap keeps all ≤2 plus strongest 3rd-order hits.

#include "biquad.h"
#include "delay_line.h"
#include "dsp_math.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace calfNXT {
namespace Dsp {

class ReverbEr
{
public:
  static constexpr int kBuf = 65536; // ~680 ms @ 96 kHz (large-room paths)
  static constexpr int kMaxMulti = 32;  // all ≤2 (~24) + strongest order-3
  static constexpr int kMaxVelvet = 62; // all order ≤3 images (~62)
  static constexpr int kMaxTaps = kMaxVelvet;
  static constexpr int kCandMax = 96;
  static constexpr float kSoundMs = 343.f;   // m/s
  static constexpr float kEarSep = 0.0875f; // half interaural distance (m)
  static constexpr float kWallRefl = 0.82f;

  enum Mode : int
  {
    ModeOff = 0,
    ModeMultiTap = 1, // clear: orders 1–2 + top order-3
    ModeVelvet = 2,   // denser orders 1–3 (capped)
  };

  void setup(float sr)
  {
    sr_ = sr > 1.f ? sr : 44100.f;
    hpL_.setHpRbj(200.f, 0.707f, sr_);
    hpR_.setHpRbj(200.f, 0.707f, sr_);
    rebuild();
  }

  void reset()
  {
    line_.reset();
    hpL_.reset();
    hpR_.reset();
  }

  void setMode(Mode m)
  {
    if (mode_ == m)
      return;
    mode_ = m;
    rebuild();
  }

  void setRoomSizeM(float meters)
  {
    meters = std::clamp(meters, 2.f, 40.f);
    if (std::fabs(meters - roomM_) < 1.0e-4f)
      return;
    roomM_ = meters;
    rebuild();
  }

  void setDistance(float d)
  {
    d = std::clamp(d, 0.f, 1.f);
    if (std::fabs(d - distance_) < 1.0e-4f)
      return;
    distance_ = d;
    rebuild();
  }

  /** Latest relative ER arrival in ms (for UI / diagnostics). */
  float windowMs() const { return windowMs_; }

  void process(float inL, float inR, float& outL, float& outR)
  {
    if (mode_ == ModeOff)
    {
      outL = 0.f;
      outR = 0.f;
      return;
    }

    // Shared source: both ears hear reflections of the same mid signal.
    line_.write(0.5f * (inL + inR));

    float sumL = 0.f;
    float sumR = 0.f;
    const int n = tapCount_;
    for (int i = 0; i < n; ++i)
    {
      sumL += line_.read(tapL_[i]) * ampL_[i];
      sumR += line_.read(tapR_[i]) * ampR_[i];
    }

    outL = float(hpL_.process(sumL));
    outR = float(hpR_.process(sumR));
    sanitizeDenormal(outL);
    sanitizeDenormal(outR);
  }

private:
  struct Vec3
  {
    float x, y, z;
  };

  static float dist3(Vec3 a, Vec3 b)
  {
    const float dx = a.x - b.x;
    const float dy = a.y - b.y;
    const float dz = a.z - b.z;
    return std::sqrt(dx * dx + dy * dy + dz * dz);
  }

  /** Shoebox image coordinate on one axis (n = signed room-copy index). */
  static float imageAxis(float s, float size, int n)
  {
    // Even n: translated copy; odd n: mirrored copy.
    // n=0 → s; n=1 → 2L−s; n=−1 → −s; n=2 → 2L+s; n=−2 → −2L+s.
    if ((n & 1) == 0)
      return float(n) * size + s;
    return float(n) * size + (size - s);
  }

  struct Cand
  {
    float dL = 0.f;
    float dR = 0.f;
    float dAvg = 0.f;
    float score = 0.f;
    int order = 1;
  };

  static float candScore(int order, float dAvg)
  {
    return std::pow(kWallRefl, float(order)) / std::max(0.5f, dAvg);
  }

  void rebuild()
  {
    // roomM = length; width/height follow mild hall proportions.
    const float length = roomM_;
    const float width = roomM_ * 0.75f;
    const float height = std::clamp(2.5f + 0.22f * roomM_, 2.5f, 12.f);

    Vec3 src { length * 0.28f, width * 0.5f, 1.35f };
    const float nearM = std::min(1.0f, length * 0.12f);
    const float farM = std::max(nearM + 0.5f, length * 0.62f);
    const float srcToList = nearM + (farM - nearM) * distance_;
    Vec3 list { src.x + srcToList, width * 0.5f, 1.6f };
    list.x = std::clamp(list.x, 0.4f, length - 0.4f);

    // Face the source in the horizontal plane; ears on the interaural axis.
    float fdx = src.x - list.x;
    float fdy = src.y - list.y;
    float flen = std::sqrt(fdx * fdx + fdy * fdy);
    if (flen < 1.0e-3f)
    {
      fdx = -1.f;
      fdy = 0.f;
      flen = 1.f;
    }
    fdx /= flen;
    fdy /= flen;
    // Left = (-fdy, fdx) when facing (fdx, fdy).
    const Vec3 earL { list.x + kEarSep * (-fdy), list.y + kEarSep * fdx, list.z };
    const Vec3 earR { list.x - kEarSep * (-fdy), list.y - kEarSep * fdx, list.z };

    const float dDirect = dist3(src, list);

    Cand cands[kCandMax];
    int nCand = 0;

    // Lattice copies |n|≤3 → manhattan order up to 3.
    constexpr int nMax = 3;
    for (int nx = -nMax; nx <= nMax; ++nx)
    {
      for (int ny = -nMax; ny <= nMax; ++ny)
      {
        for (int nz = -nMax; nz <= nMax; ++nz)
        {
          const int order = std::abs(nx) + std::abs(ny) + std::abs(nz);
          if (order < 1 || order > 3)
            continue;
          if (nCand >= kCandMax)
            break;

          const Vec3 img {
            imageAxis(src.x, length, nx),
            imageAxis(src.y, width, ny),
            imageAxis(src.z, height, nz),
          };
          Cand& c = cands[nCand++];
          c.dL = dist3(img, earL);
          c.dR = dist3(img, earR);
          c.dAvg = 0.5f * (c.dL + c.dR);
          c.order = order;
          c.score = candScore(order, c.dAvg);
        }
      }
    }

    Cand selected[kMaxTaps];
    int useN = 0;

    if (mode_ == ModeMultiTap)
    {
      // All 1st/2nd-order (clear early hits), then strongest 3rd-order fillers.
      Cand low[kCandMax];
      Cand hi[kCandMax];
      int nLow = 0;
      int nHi = 0;
      for (int i = 0; i < nCand; ++i)
      {
        if (cands[i].order <= 2)
          low[nLow++] = cands[i];
        else
          hi[nHi++] = cands[i];
      }
      auto byScore = [](const Cand& a, const Cand& b) { return a.score > b.score; };
      std::sort(low, low + nLow, byScore);
      std::sort(hi, hi + nHi, byScore);

      for (int i = 0; i < nLow && useN < kMaxMulti; ++i)
        selected[useN++] = low[i];
      for (int i = 0; i < nHi && useN < kMaxMulti; ++i)
        selected[useN++] = hi[i];
    }
    else
    {
      // Velvet: densest practical ≤3 cloud, loudest first.
      std::sort(cands, cands + nCand, [](const Cand& a, const Cand& b) {
        return a.score > b.score;
      });
      useN = std::min(nCand, kMaxVelvet);
      for (int i = 0; i < useN; ++i)
        selected[i] = cands[i];
    }

    // Stable time order for process (and chart parity).
    std::sort(selected, selected + useN, [](const Cand& a, const Cand& b) {
      if (a.order != b.order)
        return a.order < b.order;
      return a.dAvg < b.dAvg;
    });

    // Normalize so a typical early hit is O(0.4) before ER level.
    float peak = 1.0e-6f;
    for (int i = 0; i < useN; ++i)
      peak = std::max(peak, selected[i].score);
    const float norm = 0.42f / peak;

    const int maxDelay = kBuf - 4;
    float maxRelMs = 8.f;
    tapCount_ = useN;

    for (int i = 0; i < useN; ++i)
    {
      const Cand& c = selected[i];
      const float refl = std::pow(kWallRefl, float(c.order));
      const float sign = (c.order & 1) ? -1.f : 1.f;

      // Arrival relative to direct (dry sits at t=0).
      float relL = (c.dL - dDirect) / kSoundMs;
      float relR = (c.dR - dDirect) / kSoundMs;
      relL = std::max(relL, 1.0e-4f);
      relR = std::max(relR, 1.0e-4f);

      tapL_[i] = std::clamp(int(relL * sr_ + 0.5f), 1, maxDelay);
      tapR_[i] = std::clamp(int(relR * sr_ + 0.5f), 1, maxDelay);

      ampL_[i] = sign * refl * norm / std::max(0.5f, c.dL);
      ampR_[i] = sign * refl * norm / std::max(0.5f, c.dR);

      maxRelMs = std::max(maxRelMs, std::max(relL, relR) * 1000.f);
    }

    for (int i = useN; i < kMaxTaps; ++i)
    {
      tapL_[i] = 1;
      tapR_[i] = 1;
      ampL_[i] = 0.f;
      ampR_[i] = 0.f;
    }

    windowMs_ = std::clamp(maxRelMs, 8.f, 500.f);
  }

  DelayLine<kBuf> line_;
  BiquadD1 hpL_, hpR_;
  Mode mode_ = ModeMultiTap;
  float sr_ = 44100.f;
  float roomM_ = 12.f;
  float distance_ = 0.45f;
  float windowMs_ = 40.f;

  int tapCount_ = 0;
  int tapL_[kMaxTaps] {};
  int tapR_[kMaxTaps] {};
  float ampL_[kMaxTaps] {};
  float ampR_[kMaxTaps] {};
};

} // namespace Dsp
} // namespace calfNXT
