#pragma once

// ITU-R BS.1770-4 loudness + true peak (stereo, channel weight 1.0).
// Momentary 400 ms, short-term 3 s, integrated with absolute −70 LUFS and
// relative −10 LU gates. LRA follows EBU Tech 3342 (10th…95th percentile).
// Analysis only — does not delay or modify the audio buffer.

#include "dsp_math.h"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <vector>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace calfNXT {
namespace Dsp {

class LoudnessMeter
{
public:
  static constexpr int kVizFloats = 21;
  static constexpr int kHistCap = 120;
  static constexpr float kInvalidDb = -200.f;

  void setSampleRate(double sr)
  {
    sampleRate_ = sr > 8000.0 ? sr : 48000.0;
    designKWeight(sampleRate_);
    blockSamples_ = std::max(1, static_cast<int>(std::lround(sampleRate_ * 0.1)));
    // ~4 h of 100 ms gating blocks without reallocating on the audio thread.
    gatedPowers_.reserve(144000);
  }

  void reset()
  {
    for (auto& f : shelf_)
      f.reset();
    for (auto& f : hp_)
      f.reset();
    std::fill(std::begin(tpHistL_), std::end(tpHistL_), 0.f);
    std::fill(std::begin(tpHistR_), std::end(tpHistR_), 0.f);
    tpPosL_ = tpPosR_ = 0;
    blockSum_ = 0.0;
    blockCount_ = 0;
    blockRing_.clear();
    gatedPowers_.clear();
    hist_.clear();
    std::fill(std::begin(lraHist_), std::end(lraHist_), 0);
    lraCount_ = 0;
    lraPowerSum_ = 0.0;
    samples_ = 0;
    tpCurL_ = tpCurR_ = 0.f;
    tpMaxL_ = tpMaxR_ = 0.f;
    spMaxL_ = spMaxR_ = 0.f;
    rmsSqL_ = rmsSqR_ = 0.f;
  }

  void setPaused(bool on) { paused_ = on; }

  void process(float L, float R)
  {
    const float zL = static_cast<float>(hp_[0].process(shelf_[0].process(L)));
    const float zR = static_cast<float>(hp_[1].process(shelf_[1].process(R)));
    blockSum_ += static_cast<double>(zL) * zL + static_cast<double>(zR) * zR;
    if (++blockCount_ >= blockSamples_)
    {
      const double mean = blockSum_ / static_cast<double>(blockSamples_);
      pushBlock(mean);
      blockSum_ = 0.0;
      blockCount_ = 0;
    }

    const float rmsA = static_cast<float>(1.0 - std::exp(-1.0 / (0.3 * sampleRate_)));
    rmsSqL_ += rmsA * (L * L - rmsSqL_);
    rmsSqR_ += rmsA * (R * R - rmsSqR_);

    const float aL = std::fabs(L);
    const float aR = std::fabs(R);
    if (aL > spHoldL_)
      spHoldL_ = aL;
    if (aR > spHoldR_)
      spHoldR_ = aR;
    if (!paused_)
    {
      if (aL > spMaxL_)
        spMaxL_ = aL;
      if (aR > spMaxR_)
        spMaxR_ = aR;
      ++samples_;
    }

    const float tpL = truePeak(tpHistL_, tpPosL_, L);
    const float tpR = truePeak(tpHistR_, tpPosR_, R);
    if (tpL > tpCurL_)
      tpCurL_ = tpL;
    if (tpR > tpCurR_)
      tpCurR_ = tpR;
    if (!paused_)
    {
      if (tpL > tpMaxL_)
        tpMaxL_ = tpL;
      if (tpR > tpMaxR_)
        tpMaxR_ = tpR;
    }
  }

  /**
   * [M, S, I, LRA, tpL, tpR, tpMaxL, tpMaxR, spMaxL, spMaxR, timeSec,
   *  paused, integratedValid, lraValid, spL, spR, rmsL, rmsR,
   *  lraLo, lraHi, histCount,
   *  then histCount × (M, S, true-peak dB, broadband RMS dB)].
   * lraLo / lraHi are the absolute short-term ends (10th and 95th percentile).
   * Currents are since the previous take. History is the last ~12 s at 10 Hz.
   */
  int take(float* out, int maxOut)
  {
    if (!out || maxOut < kVizFloats)
      return 0;
    const double mPow = windowPower(4);
    const double sPow = windowPower(30);
    double iPow = 0.0;
    const bool iOk = integratedPower(iPow);
    float lra = 0.f;
    float lraLo = kInvalidDb;
    float lraHi = kInvalidDb;
    const bool lraOk = loudnessRange(lra, lraLo, lraHi);

    out[0] = powerToLufs(mPow);
    out[1] = powerToLufs(sPow);
    out[2] = iOk ? powerToLufs(iPow) : kInvalidDb;
    out[3] = lraOk ? lra : -1.f;
    out[4] = linToDb(tpCurL_);
    out[5] = linToDb(tpCurR_);
    out[6] = linToDb(tpMaxL_);
    out[7] = linToDb(tpMaxR_);
    out[8] = linToDb(spMaxL_);
    out[9] = linToDb(spMaxR_);
    out[10] = static_cast<float>(static_cast<double>(samples_) / sampleRate_);
    out[11] = paused_ ? 1.f : 0.f;
    out[12] = iOk ? 1.f : 0.f;
    out[13] = lraOk ? 1.f : 0.f;
    out[14] = linToDb(spHoldL_);
    out[15] = linToDb(spHoldR_);
    out[16] = linToDb(std::sqrt(std::max(0.f, rmsSqL_)));
    out[17] = linToDb(std::sqrt(std::max(0.f, rmsSqR_)));
    out[18] = lraLo;
    out[19] = lraHi;

    const int histN = static_cast<int>(hist_.size());
    const int room = (maxOut - kVizFloats) / 4;
    const int n = std::min(histN, room);
    out[20] = static_cast<float>(n);
    int w = kVizFloats;
    const int begin = histN - n;
    for (int i = 0; i < n; ++i)
    {
      const auto& h = hist_[static_cast<size_t>(begin + i)];
      out[w++] = h.m;
      out[w++] = h.s;
      out[w++] = h.tp;
      out[w++] = h.rms;
    }

    tpCurL_ = tpCurR_ = 0.f;
    spHoldL_ = spHoldR_ = 0.f;
    return w;
  }

private:
  struct Biquad
  {
    double b0 = 1.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0;
    double x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0;

    double process(double x)
    {
      const double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      sanitize(x1);
      sanitize(y1);
      sanitize(x2);
      sanitize(y2);
      return y;
    }

    void reset() { x1 = x2 = y1 = y2 = 0.0; }
  };

  void designKWeight(double sr)
  {
    // BS.1770 pre-filter (high shelf) + RLB high-pass, bilinear, any sample rate.
    double f0 = 1681.974450955533;
    double G = 3.999843853973347;
    double Q = 0.7071752369554196;
    double K = std::tan(M_PI * f0 / sr);
    const double Vh = std::pow(10.0, G / 20.0);
    const double Vb = std::pow(Vh, 0.4996667741545416);
    double a0 = 1.0 + K / Q + K * K;
    for (auto& f : shelf_)
    {
      f.b0 = (Vh + Vb * K / Q + K * K) / a0;
      f.b1 = 2.0 * (K * K - Vh) / a0;
      f.b2 = (Vh - Vb * K / Q + K * K) / a0;
      f.a1 = 2.0 * (K * K - 1.0) / a0;
      f.a2 = (1.0 - K / Q + K * K) / a0;
    }

    f0 = 38.13547087602444;
    Q = 0.5003270373238773;
    K = std::tan(M_PI * f0 / sr);
    a0 = 1.0 + K / Q + K * K;
    for (auto& f : hp_)
    {
      f.b0 = 1.0 / a0;
      f.b1 = -2.0 / a0;
      f.b2 = 1.0 / a0;
      f.a1 = 2.0 * (K * K - 1.0) / a0;
      f.a2 = (1.0 - K / Q + K * K) / a0;
    }
  }

  static float powerToLufs(double meanSquare)
  {
    if (!(meanSquare > 1.0e-20))
      return kInvalidDb;
    return static_cast<float>(-0.691 + 10.0 * std::log10(meanSquare));
  }

  static float linToDb(float lin)
  {
    if (!(lin > 1.0e-12f))
      return kInvalidDb;
    return 20.f * std::log10(lin);
  }

  void pushBlock(double meanSquare)
  {
    blockRing_.push_back(meanSquare);
    if (blockRing_.size() > 30)
      blockRing_.erase(blockRing_.begin());

    if (paused_)
      return;

    if (blockRing_.size() >= 4)
    {
      const double m = windowPower(4);
      const float lufs = powerToLufs(m);
      if (lufs > -70.f && gatedPowers_.size() < gatedPowers_.capacity())
        gatedPowers_.push_back(static_cast<float>(m));
    }
    const float tp = linToDb(std::max(tpCurL_, tpCurR_));
    const float rms = linToDb(std::sqrt(std::max(0.f, 0.5f * (rmsSqL_ + rmsSqR_))));
    const float mom = powerToLufs(windowPower(std::min(4, static_cast<int>(blockRing_.size()))));
    const float st = powerToLufs(windowPower(std::min(30, static_cast<int>(blockRing_.size()))));
    if (hist_.size() >= static_cast<size_t>(kHistCap))
      hist_.erase(hist_.begin());
    hist_.push_back(Hist{mom, st, tp, rms});
    if (blockRing_.size() >= 30)
    {
      const float st = powerToLufs(windowPower(30));
      if (st > -70.f && st < 10.f)
      {
        const int bin = static_cast<int>(std::lround((st + 70.f) * 10.f));
        if (bin >= 0 && bin < kLraBins)
        {
          lraHist_[bin] += 1;
          ++lraCount_;
          lraPowerSum_ += std::pow(10.0, (static_cast<double>(st) + 0.691) / 10.0);
        }
      }
    }
  }

  double windowPower(int blocks) const
  {
    if (static_cast<int>(blockRing_.size()) < blocks || blocks < 1)
      return 0.0;
    double sum = 0.0;
    const auto begin = blockRing_.end() - blocks;
    for (auto it = begin; it != blockRing_.end(); ++it)
      sum += *it;
    return sum / static_cast<double>(blocks);
  }

  bool integratedPower(double& out) const
  {
    if (gatedPowers_.empty())
      return false;
    double sum = 0.0;
    for (float p : gatedPowers_)
      sum += static_cast<double>(p);
    const double absMean = sum / static_cast<double>(gatedPowers_.size());
    const float absLufs = powerToLufs(absMean);
    const double rel = std::pow(10.0, (static_cast<double>(absLufs) - 10.0 + 0.691) / 10.0);
    sum = 0.0;
    int n = 0;
    for (float p : gatedPowers_)
    {
      if (static_cast<double>(p) >= rel)
      {
        sum += static_cast<double>(p);
        ++n;
      }
    }
    if (n < 1)
      return false;
    out = sum / static_cast<double>(n);
    return true;
  }

  bool loudnessRange(float& out, float& loLufs, float& hiLufs) const
  {
    if (lraCount_ < 20)
      return false;
    const double absMean = lraPowerSum_ / static_cast<double>(lraCount_);
    const float absLufs = powerToLufs(absMean);
    const float relLufs = absLufs - 20.f;
    const int relBin = static_cast<int>(std::floor((relLufs + 70.f) * 10.f));
    int above = 0;
    for (int i = std::max(0, relBin); i < kLraBins; ++i)
      above += lraHist_[i];
    if (above < 2)
      return false;
    const int loRank = std::max(1, static_cast<int>(std::lround(0.10 * above)));
    const int hiRank = std::max(loRank, static_cast<int>(std::lround(0.95 * above)));
    int seen = 0;
    int loBin = relBin;
    int hiBin = relBin;
    bool gotLo = false;
    for (int i = std::max(0, relBin); i < kLraBins; ++i)
    {
      seen += lraHist_[i];
      if (!gotLo && seen >= loRank)
      {
        loBin = i;
        gotLo = true;
      }
      if (seen >= hiRank)
      {
        hiBin = i;
        break;
      }
    }
    out = static_cast<float>(hiBin - loBin) * 0.1f;
    loLufs = static_cast<float>(loBin) * 0.1f - 70.f;
    hiLufs = static_cast<float>(hiBin) * 0.1f - 70.f;
    return true;
  }

  float truePeak(float* hist, int& pos, float x)
  {
    pos = (pos + 1) % 24;
    hist[pos] = x;
    float peak = std::fabs(x);
    for (int phase = 0; phase < 4; ++phase)
    {
      float y = 0.f;
      for (int k = 0; k < 12; ++k)
      {
        const int idx = (pos + 24 - k) % 24;
        y += kTpCoeff[phase][k] * hist[idx];
      }
      peak = std::max(peak, std::fabs(y));
    }
    return peak;
  }

  // BS.1770-4 Annex 2, 4× polyphase, 12 taps (libebur128 / ITU coefficients).
  struct Hist
  {
    float m;
    float s;
    float tp;
    float rms;
  };

  static constexpr float kTpCoeff[4][12] = {
    {0.0017089843750f, 0.0109863281250f, -0.0196533203125f, 0.0332031250000f,
     -0.0594482421875f, 0.1373291015625f, 0.9721679687500f, -0.1022949218750f,
     0.0476074218750f, -0.0266113281250f, 0.0148925781250f, -0.0083007812500f},
    {-0.0291748046875f, 0.0292968750000f, -0.0517578125000f, 0.0891113281250f,
     -0.1665039062500f, 0.4650878906250f, 0.7797851562500f, -0.2003173828125f,
     0.1015625000000f, -0.0582275390625f, 0.0330810546875f, -0.0189208984375f},
    {-0.0189208984375f, 0.0330810546875f, -0.0582275390625f, 0.1015625000000f,
     -0.2003173828125f, 0.7797851562500f, 0.4650878906250f, -0.1665039062500f,
     0.0891113281250f, -0.0517578125000f, 0.0292968750000f, -0.0291748046875f},
    {-0.0083007812500f, 0.0148925781250f, -0.0266113281250f, 0.0476074218750f,
     -0.1022949218750f, 0.9721679687500f, 0.1373291015625f, -0.0594482421875f,
     0.0332031250000f, -0.0196533203125f, 0.0109863281250f, 0.0017089843750f},
  };

  static constexpr int kLraBins = 800; // −70 … +10 LUFS, 0.1 LU

  double sampleRate_ = 48000.0;
  int blockSamples_ = 4800;
  bool paused_ = false;
  Biquad shelf_[2];
  Biquad hp_[2];
  double blockSum_ = 0.0;
  int blockCount_ = 0;
  std::vector<double> blockRing_;
  std::vector<float> gatedPowers_;
  int lraHist_[kLraBins] {};
  int lraCount_ = 0;
  double lraPowerSum_ = 0.0;
  std::uint64_t samples_ = 0;
  float tpHistL_[24] {};
  float tpHistR_[24] {};
  int tpPosL_ = 0;
  int tpPosR_ = 0;
  float tpCurL_ = 0.f, tpCurR_ = 0.f;
  float tpMaxL_ = 0.f, tpMaxR_ = 0.f;
  float spHoldL_ = 0.f, spHoldR_ = 0.f;
  float spMaxL_ = 0.f, spMaxR_ = 0.f;
  float rmsSqL_ = 0.f, rmsSqR_ = 0.f;
  std::vector<Hist> hist_;
};

} // namespace Dsp
} // namespace calfNXT
