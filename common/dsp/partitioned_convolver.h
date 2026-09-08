#pragma once

// Uniform partitioned overlap-save convolution (stereo / true-stereo).
// Hop = 512, FFT = 1024. IR partitions live in the frequency domain.
// setIr() is not realtime-safe — call from a worker, then swap instances.
// Silent hops skip the FFT once the partition ring has drained (canIdle()).

#include "dsp_math.h"
#include "fft_r2.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <vector>

namespace calfNXT {
namespace Dsp {

class PartitionedStereoConvolver
{
public:
  static constexpr int kHop = 512;
  static constexpr int kFft = 1024;
  static constexpr int kBins = kFft;

  enum class Layout
  {
    Empty = 0,
    Mono = 1,
    Stereo = 2,
    TrueStereo = 4
  };

  void reset()
  {
    std::fill(inL_.begin(), inL_.end(), 0.f);
    std::fill(inR_.begin(), inR_.end(), 0.f);
    std::fill(outL_.begin(), outL_.end(), 0.f);
    std::fill(outR_.begin(), outR_.end(), 0.f);
    std::fill(overlapL_.begin(), overlapL_.end(), 0.f);
    std::fill(overlapR_.begin(), overlapR_.end(), 0.f);
    fill_ = 0;
    specWrite_ = 0;
    drainHops_ = 0;
    if (nParts_ > 0)
    {
      const int specN = nParts_ * kBins;
      std::fill(inSpecLRe_.begin(), inSpecLRe_.begin() + specN, 0.f);
      std::fill(inSpecLIm_.begin(), inSpecLIm_.begin() + specN, 0.f);
      std::fill(inSpecRRe_.begin(), inSpecRRe_.begin() + specN, 0.f);
      std::fill(inSpecRIm_.begin(), inSpecRIm_.begin() + specN, 0.f);
    }
  }

  bool empty() const { return layout_ == Layout::Empty || nParts_ <= 0; }
  int latency() const { return empty() ? 0 : kHop; }
  Layout layout() const { return layout_; }
  int irFrames() const { return irFrames_; }
  int parts() const { return nParts_; }
  /** True when input spectra and the current hop are drained — skip FFT. */
  bool canIdle() const { return drainHops_ <= 0 && fill_ == 0; }

  /**
   * Interleaved IR: frames × channels.
   * channels 1 = mono (L and R share H), 2 = L/R independent, 4 = true stereo
   *   ch0=L→L, ch1=L→R, ch2=R→L, ch3=R→R.
   */
  void setIr(const float* interleaved, int frames, int channels)
  {
    layout_ = Layout::Empty;
    nParts_ = 0;
    irFrames_ = 0;
    nIr_ = 0;
    if (!interleaved || frames < 1)
    {
      reset();
      return;
    }
    channels = std::clamp(channels, 1, 4);
    if (channels == 3)
      channels = 2;
    nIr_ = channels == 4 ? 4 : (channels == 2 ? 2 : 1);
    layout_ = channels == 4 ? Layout::TrueStereo
                            : (channels == 2 ? Layout::Stereo : Layout::Mono);
    irFrames_ = frames;
    nParts_ = (frames + kHop - 1) / kHop;
    if (nParts_ < 1)
      nParts_ = 1;

    const int specN = nParts_ * kBins;
    const int irSpecN = nIr_ * specN;
    hRe_.assign(static_cast<size_t>(irSpecN), 0.f);
    hIm_.assign(static_cast<size_t>(irSpecN), 0.f);
    inSpecLRe_.assign(static_cast<size_t>(specN), 0.f);
    inSpecLIm_.assign(static_cast<size_t>(specN), 0.f);
    inSpecRRe_.assign(static_cast<size_t>(specN), 0.f);
    inSpecRIm_.assign(static_cast<size_t>(specN), 0.f);
    accRe_.assign(kBins, 0.f);
    accIm_.assign(kBins, 0.f);
    fftRe_.assign(kFft, 0.f);
    fftIm_.assign(kFft, 0.f);

    std::vector<float> part(static_cast<size_t>(kFft), 0.f);
    for (int ir = 0; ir < nIr_; ++ir)
    {
      for (int p = 0; p < nParts_; ++p)
      {
        std::fill(part.begin(), part.end(), 0.f);
        const int i0 = p * kHop;
        const int n = std::min(kHop, frames - i0);
        for (int i = 0; i < n; ++i)
          part[static_cast<size_t>(i)] = interleaved[(i0 + i) * channels + ir];
        std::fill(fftRe_.begin(), fftRe_.end(), 0.f);
        std::fill(fftIm_.begin(), fftIm_.end(), 0.f);
        std::memcpy(fftRe_.data(), part.data(), sizeof(float) * static_cast<size_t>(kFft));
        fftRadix2(fftRe_.data(), fftIm_.data(), kFft);
        const int dst = (ir * nParts_ + p) * kBins;
        std::memcpy(hRe_.data() + dst, fftRe_.data(), sizeof(float) * static_cast<size_t>(kBins));
        std::memcpy(hIm_.data() + dst, fftIm_.data(), sizeof(float) * static_cast<size_t>(kBins));
      }
    }
    reset();
  }

  void process(float* left, float* right, int n)
  {
    if (!left || !right || n <= 0)
      return;
    if (empty())
    {
      // Pass through — caller mixes dry/wet; wet should be silence.
      for (int i = 0; i < n; ++i)
      {
        left[i] = 0.f;
        right[i] = 0.f;
      }
      return;
    }
    for (int i = 0; i < n; ++i)
    {
      inL_[static_cast<size_t>(fill_)] = left[i];
      inR_[static_cast<size_t>(fill_)] = right[i];
      left[i] = outL_[static_cast<size_t>(fill_)];
      right[i] = outR_[static_cast<size_t>(fill_)];
      if (++fill_ >= kHop)
      {
        processHop();
        fill_ = 0;
      }
    }
  }

private:
  void fftRealBlock(const float* overlap, const float* hop, float* specRe, float* specIm)
  {
    std::fill(fftRe_.begin(), fftRe_.end(), 0.f);
    std::fill(fftIm_.begin(), fftIm_.end(), 0.f);
    std::memcpy(fftRe_.data(), overlap, sizeof(float) * static_cast<size_t>(kHop));
    std::memcpy(fftRe_.data() + kHop, hop, sizeof(float) * static_cast<size_t>(kHop));
    fftRadix2(fftRe_.data(), fftIm_.data(), kFft);
    std::memcpy(specRe, fftRe_.data(), sizeof(float) * static_cast<size_t>(kBins));
    std::memcpy(specIm, fftIm_.data(), sizeof(float) * static_cast<size_t>(kBins));
  }

  void ifftToHop(float* hopOut)
  {
    std::memcpy(fftRe_.data(), accRe_.data(), sizeof(float) * static_cast<size_t>(kBins));
    std::memcpy(fftIm_.data(), accIm_.data(), sizeof(float) * static_cast<size_t>(kBins));
    ifftRadix2(fftRe_.data(), fftIm_.data(), kFft);
    for (int i = 0; i < kHop; ++i)
    {
      float y = fftRe_[static_cast<size_t>(kHop + i)];
      sanitizeDenormal(y);
      hopOut[i] = y;
    }
  }

  bool hopNearSilent() const
  {
    constexpr float kEps = 1.0e-8f;
    for (int i = 0; i < kHop; ++i)
    {
      if (std::fabs(inL_[static_cast<size_t>(i)]) > kEps
          || std::fabs(inR_[static_cast<size_t>(i)]) > kEps)
        return false;
    }
    return true;
  }

  void writeZeroSpec(int slot)
  {
    const int off = slot * kBins;
    std::fill(inSpecLRe_.begin() + off, inSpecLRe_.begin() + off + kBins, 0.f);
    std::fill(inSpecLIm_.begin() + off, inSpecLIm_.begin() + off + kBins, 0.f);
    std::fill(inSpecRRe_.begin() + off, inSpecRRe_.begin() + off + kBins, 0.f);
    std::fill(inSpecRIm_.begin() + off, inSpecRIm_.begin() + off + kBins, 0.f);
  }

  void processHop()
  {
    const bool silent = hopNearSilent();
    if (silent)
    {
      if (drainHops_ <= 0)
      {
        writeZeroSpec(specWrite_);
        std::fill(outL_.begin(), outL_.end(), 0.f);
        std::fill(outR_.begin(), outR_.end(), 0.f);
        std::memcpy(overlapL_.data(), inL_.data(), sizeof(float) * static_cast<size_t>(kHop));
        std::memcpy(overlapR_.data(), inR_.data(), sizeof(float) * static_cast<size_t>(kHop));
        specWrite_ = (specWrite_ + 1) % nParts_;
        return;
      }
      --drainHops_;
    }
    else
    {
      drainHops_ = nParts_ + 2;
    }

    const int slot = specWrite_;
    if (silent)
    {
      writeZeroSpec(slot);
    }
    else
    {
      fftRealBlock(overlapL_.data(), inL_.data(), inSpecLRe_.data() + slot * kBins,
                   inSpecLIm_.data() + slot * kBins);
      fftRealBlock(overlapR_.data(), inR_.data(), inSpecRRe_.data() + slot * kBins,
                   inSpecRIm_.data() + slot * kBins);
    }

    std::fill(accRe_.begin(), accRe_.end(), 0.f);
    std::fill(accIm_.begin(), accIm_.end(), 0.f);
    accumulateOutL();
    ifftToHop(outL_.data());

    std::fill(accRe_.begin(), accRe_.end(), 0.f);
    std::fill(accIm_.begin(), accIm_.end(), 0.f);
    accumulateOutR();
    ifftToHop(outR_.data());

    std::memcpy(overlapL_.data(), inL_.data(), sizeof(float) * static_cast<size_t>(kHop));
    std::memcpy(overlapR_.data(), inR_.data(), sizeof(float) * static_cast<size_t>(kHop));
    specWrite_ = (specWrite_ + 1) % nParts_;
  }

  void multiplyAdd(const float* xRe, const float* xIm, int ir, int part)
  {
    const float* hRe = hRe_.data() + (ir * nParts_ + part) * kBins;
    const float* hIm = hIm_.data() + (ir * nParts_ + part) * kBins;
    for (int k = 0; k < kBins; ++k)
    {
      accRe_[static_cast<size_t>(k)] += xRe[k] * hRe[k] - xIm[k] * hIm[k];
      accIm_[static_cast<size_t>(k)] += xRe[k] * hIm[k] + xIm[k] * hRe[k];
    }
  }

  void accumulateOutL()
  {
    for (int d = 0; d < nParts_; ++d)
    {
      const int slot = (specWrite_ - d + nParts_) % nParts_;
      const float* xLRe = inSpecLRe_.data() + slot * kBins;
      const float* xLIm = inSpecLIm_.data() + slot * kBins;
      const float* xRRe = inSpecRRe_.data() + slot * kBins;
      const float* xRIm = inSpecRIm_.data() + slot * kBins;
      if (layout_ == Layout::TrueStereo)
      {
        multiplyAdd(xLRe, xLIm, 0, d); // L→L
        multiplyAdd(xRRe, xRIm, 2, d); // R→L
      }
      else if (layout_ == Layout::Stereo)
      {
        multiplyAdd(xLRe, xLIm, 0, d);
      }
      else
      {
        multiplyAdd(xLRe, xLIm, 0, d);
      }
    }
  }

  void accumulateOutR()
  {
    for (int d = 0; d < nParts_; ++d)
    {
      const int slot = (specWrite_ - d + nParts_) % nParts_;
      const float* xLRe = inSpecLRe_.data() + slot * kBins;
      const float* xLIm = inSpecLIm_.data() + slot * kBins;
      const float* xRRe = inSpecRRe_.data() + slot * kBins;
      const float* xRIm = inSpecRIm_.data() + slot * kBins;
      if (layout_ == Layout::TrueStereo)
      {
        multiplyAdd(xLRe, xLIm, 1, d); // L→R
        multiplyAdd(xRRe, xRIm, 3, d); // R→R
      }
      else if (layout_ == Layout::Stereo)
      {
        multiplyAdd(xRRe, xRIm, 1, d);
      }
      else
      {
        multiplyAdd(xRRe, xRIm, 0, d);
      }
    }
  }

  Layout layout_ = Layout::Empty;
  int nParts_ = 0;
  int nIr_ = 0;
  int irFrames_ = 0;
  int fill_ = 0;
  int specWrite_ = 0;
  int drainHops_ = 0;

  std::vector<float> hRe_;
  std::vector<float> hIm_;
  std::vector<float> inSpecLRe_;
  std::vector<float> inSpecLIm_;
  std::vector<float> inSpecRRe_;
  std::vector<float> inSpecRIm_;
  std::vector<float> accRe_;
  std::vector<float> accIm_;
  std::vector<float> fftRe_;
  std::vector<float> fftIm_;
  std::vector<float> inL_ = std::vector<float>(kHop, 0.f);
  std::vector<float> inR_ = std::vector<float>(kHop, 0.f);
  std::vector<float> outL_ = std::vector<float>(kHop, 0.f);
  std::vector<float> outR_ = std::vector<float>(kHop, 0.f);
  std::vector<float> overlapL_ = std::vector<float>(kHop, 0.f);
  std::vector<float> overlapR_ = std::vector<float>(kHop, 0.f);
};

} // namespace Dsp
} // namespace calfNXT
