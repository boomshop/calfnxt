#pragma once

// IR file loaders: WAV (PCM 16/24/32 + float32) and uncompressed AIFF/AIFC.

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace calfNXT {
namespace Dsp {

struct IrBuffer
{
  int channels = 0;
  int frames = 0;
  float sampleRate = 44100.f;
  std::vector<float> interleaved;
  std::string name;
};

inline uint16_t wavU16(const uint8_t* p)
{
  return static_cast<uint16_t>(p[0] | (p[1] << 8));
}

inline uint32_t wavU32(const uint8_t* p)
{
  return static_cast<uint32_t>(p[0] | (p[1] << 8) | (p[2] << 16) | (p[3] << 24));
}

inline int32_t wavI24(const uint8_t* p)
{
  int32_t v = static_cast<int32_t>(p[0] | (p[1] << 8) | (p[2] << 16));
  if (v & 0x800000)
    v |= static_cast<int32_t>(0xFF000000);
  return v;
}

inline bool loadWavFile(const char* path, IrBuffer& out, std::string* err = nullptr)
{
  out = IrBuffer{};
  if (!path || !path[0])
  {
    if (err)
      *err = "empty path";
    return false;
  }
  FILE* f = std::fopen(path, "rb");
  if (!f)
  {
    if (err)
      *err = "could not open file";
    return false;
  }

  auto fail = [&](const char* m) {
    std::fclose(f);
    if (err)
      *err = m;
    return false;
  };

  uint8_t riff[12];
  if (std::fread(riff, 1, 12, f) != 12)
    return fail("truncated header");
  if (std::memcmp(riff, "RIFF", 4) != 0 || std::memcmp(riff + 8, "WAVE", 4) != 0)
    return fail("not a WAV file");

  int channels = 0;
  int sr = 0;
  int bits = 0;
  int format = 0; // 1=PCM, 3=float
  std::vector<uint8_t> data;
  bool haveFmt = false;

  while (true)
  {
    uint8_t ch[8];
    if (std::fread(ch, 1, 8, f) != 8)
      break;
    const uint32_t sz = wavU32(ch + 4);
    if (std::memcmp(ch, "fmt ", 4) == 0)
    {
      std::vector<uint8_t> fmt(sz);
      if (sz < 16 || std::fread(fmt.data(), 1, sz, f) != sz)
        return fail("bad fmt chunk");
      format = wavU16(fmt.data());
      channels = wavU16(fmt.data() + 2);
      sr = static_cast<int>(wavU32(fmt.data() + 4));
      bits = wavU16(fmt.data() + 14);
      if (format == 0xFFFE && sz >= 40)
        format = wavU16(fmt.data() + 24); // extensible subformat
      haveFmt = true;
      if (sz & 1)
        std::fseek(f, 1, SEEK_CUR);
    }
    else if (std::memcmp(ch, "data", 4) == 0)
    {
      data.resize(sz);
      if (sz > 0 && std::fread(data.data(), 1, sz, f) != sz)
        return fail("truncated data");
      if (sz & 1)
        std::fseek(f, 1, SEEK_CUR);
    }
    else
    {
      if (std::fseek(f, static_cast<long>(sz + (sz & 1)), SEEK_CUR) != 0)
        break;
    }
  }
  std::fclose(f);

  if (!haveFmt || data.empty())
  {
    if (err)
      *err = "missing fmt/data";
    return false;
  }
  if (channels < 1 || channels > 8 || sr < 8000 || sr > 192000)
  {
    if (err)
      *err = "unsupported format";
    return false;
  }
  if (!(format == 1 || format == 3))
  {
    if (err)
      *err = "only PCM or float WAV";
    return false;
  }

  const int bytesPer = bits / 8;
  if (bytesPer < 1 || (format == 3 && bits != 32) || (format == 1 && bits != 16 && bits != 24 && bits != 32))
  {
    if (err)
      *err = "unsupported bit depth";
    return false;
  }
  const int frameBytes = bytesPer * channels;
  if (frameBytes <= 0)
    return false;
  const int frames = static_cast<int>(data.size() / static_cast<size_t>(frameBytes));
  if (frames < 1)
  {
    if (err)
      *err = "empty audio";
    return false;
  }

  int useCh = channels;
  if (useCh > 4)
    useCh = 4;
  if (useCh == 3)
    useCh = 2;

  out.channels = useCh;
  out.frames = frames;
  out.sampleRate = static_cast<float>(sr);
  out.interleaved.resize(static_cast<size_t>(frames) * static_cast<size_t>(useCh));

  const uint8_t* p = data.data();
  for (int i = 0; i < frames; ++i)
  {
    for (int c = 0; c < useCh; ++c)
    {
      const uint8_t* s = p + i * frameBytes + c * bytesPer;
      float v = 0.f;
      if (format == 3)
      {
        std::memcpy(&v, s, 4);
      }
      else if (bits == 16)
      {
        const int16_t n = static_cast<int16_t>(s[0] | (s[1] << 8));
        v = static_cast<float>(n) / 32768.f;
      }
      else if (bits == 24)
      {
        v = static_cast<float>(wavI24(s)) / 8388608.f;
      }
      else
      {
        const int32_t n = static_cast<int32_t>(wavU32(s));
        v = static_cast<float>(n) / 2147483648.f;
      }
      out.interleaved[static_cast<size_t>(i * useCh + c)] = v;
    }
  }
  return true;
}

inline uint16_t beU16(const uint8_t* p)
{
  return static_cast<uint16_t>((p[0] << 8) | p[1]);
}

inline uint32_t beU32(const uint8_t* p)
{
  return (static_cast<uint32_t>(p[0]) << 24) | (static_cast<uint32_t>(p[1]) << 16)
         | (static_cast<uint32_t>(p[2]) << 8) | p[3];
}

inline int32_t beI24(const uint8_t* p)
{
  int32_t v = (static_cast<int32_t>(p[0]) << 16) | (static_cast<int32_t>(p[1]) << 8) | p[2];
  if (v & 0x800000)
    v |= static_cast<int32_t>(0xFF000000);
  return v;
}

inline double ieeeExtended80(const uint8_t* p)
{
  const int sign = p[0] >> 7;
  int exp = ((p[0] & 0x7F) << 8) | p[1];
  uint64_t mant = 0;
  for (int i = 2; i < 10; ++i)
    mant = (mant << 8) | p[i];
  if (exp == 0 && mant == 0)
    return 0.0;
  if (exp == 0x7FFF)
    return sign ? -1.0e300 : 1.0e300;
  const double val = std::ldexp(static_cast<double>(mant), exp - 16383 - 63);
  return sign ? -val : val;
}

inline float decodePcm(const uint8_t* s, int bits, bool little, bool isFloat)
{
  if (isFloat)
  {
    uint8_t b[4];
    if (little)
      std::memcpy(b, s, 4);
    else
    {
      b[0] = s[3];
      b[1] = s[2];
      b[2] = s[1];
      b[3] = s[0];
    }
    float v = 0.f;
    std::memcpy(&v, b, 4);
    return v;
  }
  if (bits == 16)
  {
    const int16_t n = little ? static_cast<int16_t>(s[0] | (s[1] << 8))
                             : static_cast<int16_t>((s[0] << 8) | s[1]);
    return static_cast<float>(n) / 32768.f;
  }
  if (bits == 24)
  {
    const int32_t n = little ? wavI24(s) : beI24(s);
    return static_cast<float>(n) / 8388608.f;
  }
  const uint32_t u = little ? wavU32(s) : beU32(s);
  return static_cast<float>(static_cast<int32_t>(u)) / 2147483648.f;
}

inline bool loadAiffFile(const char* path, IrBuffer& out, std::string* err, FILE* alreadyOpen,
                         const uint8_t header12[12])
{
  FILE* f = alreadyOpen;
  auto fail = [&](const char* m) {
    std::fclose(f);
    if (err)
      *err = m;
    return false;
  };

  const bool isAifc = std::memcmp(header12 + 8, "AIFC", 4) == 0;
  if (std::memcmp(header12, "FORM", 4) != 0
      || (!isAifc && std::memcmp(header12 + 8, "AIFF", 4) != 0))
    return fail("not an AIFF file");

  int channels = 0;
  int bits = 0;
  int frames = 0;
  float sr = 44100.f;
  bool little = false;
  bool isFloat = false;
  bool haveComm = false;
  std::vector<uint8_t> data;
  uint32_t ssndOffset = 0;

  while (true)
  {
    uint8_t ch[8];
    if (std::fread(ch, 1, 8, f) != 8)
      break;
    const uint32_t sz = beU32(ch + 4);
    if (std::memcmp(ch, "COMM", 4) == 0)
    {
      std::vector<uint8_t> comm(sz);
      if (sz < 18 || std::fread(comm.data(), 1, sz, f) != sz)
        return fail("bad COMM chunk");
      channels = beU16(comm.data());
      frames = static_cast<int>(beU32(comm.data() + 2));
      bits = beU16(comm.data() + 6);
      sr = static_cast<float>(ieeeExtended80(comm.data() + 8));
      if (isAifc && sz >= 22)
      {
        const char* comp = reinterpret_cast<const char*>(comm.data() + 18);
        if (std::memcmp(comp, "sowt", 4) == 0)
          little = true;
        else if (std::memcmp(comp, "fl32", 4) == 0 || std::memcmp(comp, "FL32", 4) == 0)
          isFloat = true;
        else if (std::memcmp(comp, "NONE", 4) != 0 && std::memcmp(comp, "twos", 4) != 0)
          return fail("compressed AIFF not supported");
      }
      haveComm = true;
      if (sz & 1)
        std::fseek(f, 1, SEEK_CUR);
    }
    else if (std::memcmp(ch, "SSND", 4) == 0)
    {
      uint8_t head[8];
      if (sz < 8 || std::fread(head, 1, 8, f) != 8)
        return fail("bad SSND chunk");
      ssndOffset = beU32(head);
      const uint32_t payload = sz - 8;
      data.resize(payload);
      if (payload > 0 && std::fread(data.data(), 1, payload, f) != payload)
        return fail("truncated SSND");
      if (sz & 1)
        std::fseek(f, 1, SEEK_CUR);
    }
    else
    {
      if (std::fseek(f, static_cast<long>(sz + (sz & 1)), SEEK_CUR) != 0)
        break;
    }
  }
  std::fclose(f);

  if (!haveComm || data.empty())
  {
    if (err)
      *err = "missing COMM/SSND";
    return false;
  }
  if (ssndOffset > 0)
  {
    if (ssndOffset >= data.size())
    {
      if (err)
        *err = "bad SSND offset";
      return false;
    }
    data.erase(data.begin(), data.begin() + static_cast<std::ptrdiff_t>(ssndOffset));
  }
  if (channels < 1 || channels > 8 || sr < 8000.f || sr > 192000.f)
  {
    if (err)
      *err = "unsupported format";
    return false;
  }
  if (isFloat)
    bits = 32;
  const int bytesPer = bits / 8;
  if (bytesPer < 1 || (bits != 16 && bits != 24 && bits != 32))
  {
    if (err)
      *err = "unsupported bit depth";
    return false;
  }
  int useCh = channels > 4 ? 4 : channels;
  if (useCh == 3)
    useCh = 2;
  const int frameBytes = bytesPer * channels;
  if (frameBytes <= 0)
    return false;
  const int nFrames = std::min(frames, static_cast<int>(data.size() / static_cast<size_t>(frameBytes)));
  if (nFrames < 1)
  {
    if (err)
      *err = "empty audio";
    return false;
  }

  out.channels = useCh;
  out.frames = nFrames;
  out.sampleRate = sr;
  out.interleaved.resize(static_cast<size_t>(nFrames) * static_cast<size_t>(useCh));
  const uint8_t* p = data.data();
  for (int i = 0; i < nFrames; ++i)
  {
    for (int c = 0; c < useCh; ++c)
    {
      const uint8_t* s = p + i * frameBytes + c * bytesPer;
      out.interleaved[static_cast<size_t>(i * useCh + c)] = decodePcm(s, bits, little, isFloat);
    }
  }
  return true;
}

/** WAV or uncompressed AIFF/AIFC (NONE / twos / sowt / fl32). */
inline bool loadIrFile(const char* path, IrBuffer& out, std::string* err = nullptr)
{
  out = IrBuffer{};
  if (!path || !path[0])
  {
    if (err)
      *err = "empty path";
    return false;
  }
  FILE* f = std::fopen(path, "rb");
  if (!f)
  {
    if (err)
      *err = "could not open file";
    return false;
  }
  uint8_t mag[12];
  if (std::fread(mag, 1, 12, f) != 12)
  {
    std::fclose(f);
    if (err)
      *err = "truncated header";
    return false;
  }
  if (std::memcmp(mag, "RIFF", 4) == 0)
  {
    std::fclose(f);
    return loadWavFile(path, out, err);
  }
  if (std::memcmp(mag, "FORM", 4) == 0)
    return loadAiffFile(path, out, err, f, mag);
  std::fclose(f);
  if (err)
    *err = "not WAV or AIFF";
  return false;
}

inline float hermite4(float y0, float y1, float y2, float y3, float x)
{
  const float c0 = y1;
  const float c1 = 0.5f * (y2 - y0);
  const float c2 = y0 - 2.5f * y1 + 2.f * y2 - 0.5f * y3;
  const float c3 = 0.5f * (y3 - y0) + 1.5f * (y1 - y2);
  return ((c3 * x + c2) * x + c1) * x + c0;
}

/** Resample interleaved IR to dstSr (cubic). */
inline void resampleIr(IrBuffer& ir, float dstSr)
{
  if (ir.frames < 2 || ir.channels < 1 || dstSr <= 0.f)
    return;
  if (std::fabs(ir.sampleRate - dstSr) < 0.5f)
  {
    ir.sampleRate = dstSr;
    return;
  }
  const double ratio = static_cast<double>(ir.sampleRate) / static_cast<double>(dstSr);
  const int srcN = ir.frames;
  const int dstN = std::max(1, static_cast<int>(std::llround(static_cast<double>(srcN) / ratio)));
  const int ch = ir.channels;
  std::vector<float> dst(static_cast<size_t>(dstN) * static_cast<size_t>(ch), 0.f);
  auto at = [&](int f, int c) -> float {
    f = std::clamp(f, 0, srcN - 1);
    return ir.interleaved[static_cast<size_t>(f * ch + c)];
  };
  for (int i = 0; i < dstN; ++i)
  {
    const double pos = static_cast<double>(i) * ratio;
    const int i1 = static_cast<int>(pos);
    const float x = static_cast<float>(pos - static_cast<double>(i1));
    for (int c = 0; c < ch; ++c)
      dst[static_cast<size_t>(i * ch + c)] =
        hermite4(at(i1 - 1, c), at(i1, c), at(i1 + 1, c), at(i1 + 2, c), x);
  }
  ir.interleaved.swap(dst);
  ir.frames = dstN;
  ir.sampleRate = dstSr;
}

inline void reverseIr(IrBuffer& ir)
{
  if (ir.frames < 2 || ir.channels < 1)
    return;
  const int ch = ir.channels;
  for (int i = 0, j = ir.frames - 1; i < j; ++i, --j)
  {
    for (int c = 0; c < ch; ++c)
      std::swap(ir.interleaved[static_cast<size_t>(i * ch + c)],
                ir.interleaved[static_cast<size_t>(j * ch + c)]);
  }
}

/** Quality 0=Lo mono, 1=Mid stereo L/R, 2=Hi true-stereo when the file has it. */
inline int irQualityMaxChannels(int quality)
{
  const int q = std::clamp(quality, 0, 2);
  return q <= 0 ? 1 : (q == 1 ? 2 : 4);
}

/**
 * Drop extra IR paths for Quality. 4ch→2 keeps LL/RR (no crossfeed).
 * 4ch/2ch→1 is (LL+RR)/2 or (L+R)/2. No-op when already at or below maxCh.
 */
inline void collapseIrChannels(IrBuffer& ir, int maxCh)
{
  maxCh = std::clamp(maxCh, 1, 4);
  if (maxCh == 3)
    maxCh = 2;
  if (ir.frames < 1 || ir.channels < 1 || ir.channels <= maxCh)
    return;
  const int srcCh = ir.channels;
  const int dstCh = maxCh;
  std::vector<float> dst(static_cast<size_t>(ir.frames) * static_cast<size_t>(dstCh), 0.f);
  for (int i = 0; i < ir.frames; ++i)
  {
    const float* s = ir.interleaved.data() + static_cast<size_t>(i * srcCh);
    float* d = dst.data() + static_cast<size_t>(i * dstCh);
    if (dstCh == 1)
    {
      if (srcCh >= 4)
        d[0] = 0.5f * (s[0] + s[3]);
      else
        d[0] = 0.5f * (s[0] + s[1]);
    }
    else
    {
      if (srcCh >= 4)
      {
        d[0] = s[0];
        d[1] = s[3];
      }
      else
      {
        d[0] = s[0];
        d[1] = s[1];
      }
    }
  }
  ir.interleaved.swap(dst);
  ir.channels = dstCh;
}

/** ~-90 dB as ln(amplitude). Chart overlay uses the same floor as dB. */
constexpr float kIrDecayLnFloor = -10.3616f;
constexpr float kIrShapeMin = 1.f;
constexpr float kIrShapeMax = 8.f;

/**
 * Envelope gain at normalised time t in 0…1.
 * shape is a power on the dB ramp: 1 = linear in dB, 8 ≈ hang-then-drop.
 * Keep in sync with ImpulseChart fadeDb().
 */
inline float irDecayGainAt(float t, float shape)
{
  t = std::clamp(t, 0.f, 1.f);
  shape = std::clamp(shape, kIrShapeMin, kIrShapeMax);
  return std::exp(kIrDecayLnFloor * std::pow(t, shape));
}

/** Extra fade + truncate. decay 1 = identity (no attenuation). */
inline void applyDecay(IrBuffer& ir, float decay, float shape = 4.f)
{
  decay = std::clamp(decay, 0.15f, 1.f);
  if (ir.frames < 8 || ir.channels < 1)
    return;
  if (decay >= 0.999f)
    return;
  const int keep = std::max(8, static_cast<int>(std::lround(static_cast<float>(ir.frames) * decay)));
  const int ch = ir.channels;
  for (int i = 0; i < keep; ++i)
  {
    const float t = static_cast<float>(i) / static_cast<float>(keep);
    const float g = irDecayGainAt(t, shape);
    for (int c = 0; c < ch; ++c)
      ir.interleaved[static_cast<size_t>(i * ch + c)] *= g;
  }
  ir.interleaved.resize(static_cast<size_t>(keep) * static_cast<size_t>(ch));
  ir.frames = keep;
}

inline void normalizeIr(IrBuffer& ir, float peakLin = 0.5f)
{
  float peak = 0.f;
  for (float s : ir.interleaved)
    peak = std::max(peak, std::fabs(s));
  if (peak < 1.0e-8f || peakLin <= 0.f)
    return;
  const float g = peakLin / peak;
  for (float& s : ir.interleaved)
    s *= g;
}

inline void trimIrMaxSeconds(IrBuffer& ir, float maxSec)
{
  if (ir.sampleRate <= 0.f || maxSec <= 0.f)
    return;
  const int maxFrames = std::max(64, static_cast<int>(ir.sampleRate * maxSec));
  if (ir.frames <= maxFrames)
    return;
  ir.interleaved.resize(static_cast<size_t>(maxFrames) * static_cast<size_t>(ir.channels));
  ir.frames = maxFrames;
}

/** Peak envelope in dB, length bins. */
inline void irEnvelopeDb(const IrBuffer& ir, float* out, int bins, float dbMin = -90.f)
{
  if (!out || bins < 1)
    return;
  std::fill(out, out + bins, dbMin);
  if (ir.frames < 1 || ir.channels < 1)
    return;
  const int ch = ir.channels;
  for (int b = 0; b < bins; ++b)
  {
    const int i0 = (b * ir.frames) / bins;
    const int i1 = std::max(i0 + 1, ((b + 1) * ir.frames) / bins);
    float peak = 0.f;
    for (int i = i0; i < i1; ++i)
    {
      for (int c = 0; c < ch; ++c)
        peak = std::max(peak, std::fabs(ir.interleaved[static_cast<size_t>(i * ch + c)]));
    }
    const float db = peak > 1.0e-8f ? 20.f * std::log10(peak) : dbMin;
    out[b] = std::max(dbMin, std::min(6.f, db));
  }
}

} // namespace Dsp
} // namespace calfNXT
