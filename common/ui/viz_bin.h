#pragma once

/**
 * Binary viz frames on the plugin→web-host socket (mixed with newline JS).
 *
 * Single frame (little-endian), version 2:
 *   magic[4]  = 'C','N','X','V'
 *   version   = u8 (2)
 *   idLen     = u8
 *   kindLen   = u8
 *   fmt       = u8  (see Fmt)
 *   count     = u32 sample count
 *   scale     = f32  (plain = stored * scale + bias)
 *   bias      = f32
 *   id[idLen] ASCII
 *   kind[kindLen] ASCII
 *   payload[count * bytesPerSample(fmt)]
 *
 * Batch (one WebKit inject per flush tick), version 1:
 *   magic[4]  = 'C','N','X','B'
 *   version   = u8 (1)
 *   reserved[3] = 0
 *   count     = u32 number of CNXV frames that follow
 *   frame[0] … frame[count-1]  (raw CNXV blobs)
 *
 * Web-host base64-passes payloads into JS; the page expands to Float32Array.
 * Display kinds use u8/i16; mixed layouts (pitch/wave/comb) stay f32.
 */

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

namespace calfNXT {
namespace Ui {
namespace VizBin {

inline constexpr char kMagic0 = 'C';
inline constexpr char kMagic1 = 'N';
inline constexpr char kMagic2 = 'X';
inline constexpr char kMagic3 = 'V';
inline constexpr char kBatchMagic3 = 'B';
inline constexpr std::uint8_t kVersion = 2;
inline constexpr std::uint8_t kBatchVersion = 1;
inline constexpr std::size_t kHeaderSize = 20;
inline constexpr std::size_t kBatchHeaderSize = 12;
inline constexpr std::size_t kMaxIdLen = 64;
inline constexpr std::size_t kMaxKindLen = 32;
inline constexpr std::size_t kMaxSamples = 6 * (512 * 3) + 1; // mbcomp envelope worst case
inline constexpr std::uint32_t kMaxBatchFrames = 64;

enum class Fmt : std::uint8_t
{
  F32 = 0,
  I16 = 1,
  U8 = 2,
  I8 = 3,
};

struct Profile
{
  Fmt fmt = Fmt::F32;
  float scale = 1.f;
  float bias = 0.f;
};

inline bool looksLikeMagic(const char* p, std::size_t n)
{
  return n >= 4 && p[0] == kMagic0 && p[1] == kMagic1 && p[2] == kMagic2 && p[3] == kMagic3;
}

inline bool looksLikeBatchMagic(const char* p, std::size_t n)
{
  return n >= 4 && p[0] == kMagic0 && p[1] == kMagic1 && p[2] == kMagic2
         && p[3] == kBatchMagic3;
}

inline std::size_t bytesPerSample(Fmt fmt)
{
  switch (fmt)
  {
  case Fmt::I16:
    return 2;
  case Fmt::U8:
  case Fmt::I8:
    return 1;
  case Fmt::F32:
  default:
    return 4;
  }
}

inline void writeU32Le(std::uint8_t* out, std::uint32_t v)
{
  out[0] = static_cast<std::uint8_t>(v);
  out[1] = static_cast<std::uint8_t>(v >> 8);
  out[2] = static_cast<std::uint8_t>(v >> 16);
  out[3] = static_cast<std::uint8_t>(v >> 24);
}

inline std::uint32_t readU32Le(const std::uint8_t* p)
{
  return static_cast<std::uint32_t>(p[0])
       | (static_cast<std::uint32_t>(p[1]) << 8)
       | (static_cast<std::uint32_t>(p[2]) << 16)
       | (static_cast<std::uint32_t>(p[3]) << 24);
}

inline void writeF32Le(std::uint8_t* out, float v)
{
  static_assert(sizeof(float) == 4, "float must be 32-bit");
  std::uint32_t u = 0;
  std::memcpy(&u, &v, 4);
  writeU32Le(out, u);
}

inline float readF32Le(const std::uint8_t* p)
{
  const std::uint32_t u = readU32Le(p);
  float v = 0.f;
  std::memcpy(&v, &u, 4);
  return v;
}

inline void writeI16Le(std::uint8_t* out, std::int16_t v)
{
  const auto u = static_cast<std::uint16_t>(v);
  out[0] = static_cast<std::uint8_t>(u);
  out[1] = static_cast<std::uint8_t>(u >> 8);
}

inline std::int16_t readI16Le(const std::uint8_t* p)
{
  const auto u = static_cast<std::uint16_t>(p[0]) | (static_cast<std::uint16_t>(p[1]) << 8);
  return static_cast<std::int16_t>(u);
}

/** Wire profile from viz kind — keeps UI float semantics after expand. */
inline Profile profileForKind(const char* kind)
{
  if (!kind || !kind[0])
    return {};
  // History lin/GR/phase: need fine steps near the −48 dB floor.
  // u8 linear only has ~1 code between −48 and −42 dB (10^(−48/20)≈1/251).
  if (!std::strcmp(kind, "envelope"))
    return {Fmt::I16, 1.f / 32767.f, 0.f};
  // Unit-interval meters (shape density, LFO activity) — not log-displayed.
  if (!std::strcmp(kind, "shape") || !std::strcmp(kind, "unit"))
    return {Fmt::U8, 1.f / 255.f, 0.f};
  // Approx −1…1 (goniometer, correlation, bipolar LFO display).
  if (!std::strcmp(kind, "gonio") || !std::strcmp(kind, "corr")
      || !std::strcmp(kind, "lfo"))
    return {Fmt::I16, 1.f / 32767.f, 0.f};
  // dB / dBFS (centi-dB). Integer headers (spectrum bins) survive as n/0.01.
  if (!std::strcmp(kind, "levels") || !std::strcmp(kind, "gains") || !std::strcmp(kind, "gr")
      || !std::strcmp(kind, "bandio") || !std::strcmp(kind, "point")
      || !std::strcmp(kind, "spectrum") || !std::strcmp(kind, "response"))
    return {Fmt::I16, 0.01f, 0.f};
  if (!std::strcmp(kind, "hz") || !std::strcmp(kind, "midi"))
    return {Fmt::I16, 1.f, 0.f};
  if (!std::strcmp(kind, "tempo"))
    return {Fmt::I16, 0.01f, 0.f};
  // Mixed units (ctrl/pitch/wave/comb): keep f32.
  return {};
}

inline std::int64_t quantIndex(float x, float scale, float bias)
{
  if (!std::isfinite(x))
    x = bias;
  if (!(scale > 0.f) && !(scale < 0.f))
    return 0;
  return static_cast<std::int64_t>(std::llround((static_cast<double>(x) - bias) / scale));
}

inline void storeSample(std::uint8_t* dst, Fmt fmt, float x, float scale, float bias)
{
  switch (fmt)
  {
  case Fmt::I16:
  {
    const auto q = static_cast<std::int16_t>(
      std::clamp(quantIndex(x, scale, bias), static_cast<std::int64_t>(-32768),
                 static_cast<std::int64_t>(32767)));
    writeI16Le(dst, q);
    break;
  }
  case Fmt::U8:
  {
    const auto q = static_cast<std::uint8_t>(
      std::clamp(quantIndex(x, scale, bias), static_cast<std::int64_t>(0),
                 static_cast<std::int64_t>(255)));
    dst[0] = q;
    break;
  }
  case Fmt::I8:
  {
    const auto q = static_cast<std::int8_t>(
      std::clamp(quantIndex(x, scale, bias), static_cast<std::int64_t>(-128),
                 static_cast<std::int64_t>(127)));
    dst[0] = static_cast<std::uint8_t>(q);
    break;
  }
  case Fmt::F32:
  default:
    writeF32Le(dst, std::isfinite(x) ? x : 0.f);
    break;
  }
}

/** Encode one viz frame into `out` (appended). Returns false on bad args. */
inline bool encode(std::vector<char>& out, const char* id, const char* kind,
                   const float* values, int n)
{
  if (!id || !kind || n < 0 || (!values && n > 0))
    return false;
  const std::size_t idLen = std::strlen(id);
  const std::size_t kindLen = std::strlen(kind);
  if (idLen == 0 || idLen > kMaxIdLen || kindLen == 0 || kindLen > kMaxKindLen)
    return false;
  if (static_cast<std::size_t>(n) > kMaxSamples)
    return false;

  const Profile prof = profileForKind(kind);
  const std::size_t bps = bytesPerSample(prof.fmt);
  const std::size_t payload = static_cast<std::size_t>(n) * bps;
  const std::size_t total = kHeaderSize + idLen + kindLen + payload;
  const std::size_t at = out.size();
  out.resize(at + total);
  auto* p = reinterpret_cast<std::uint8_t*>(out.data() + at);
  p[0] = static_cast<std::uint8_t>(kMagic0);
  p[1] = static_cast<std::uint8_t>(kMagic1);
  p[2] = static_cast<std::uint8_t>(kMagic2);
  p[3] = static_cast<std::uint8_t>(kMagic3);
  p[4] = kVersion;
  p[5] = static_cast<std::uint8_t>(idLen);
  p[6] = static_cast<std::uint8_t>(kindLen);
  p[7] = static_cast<std::uint8_t>(prof.fmt);
  writeU32Le(p + 8, static_cast<std::uint32_t>(n));
  writeF32Le(p + 12, prof.scale);
  writeF32Le(p + 16, prof.bias);
  std::memcpy(p + kHeaderSize, id, idLen);
  std::memcpy(p + kHeaderSize + idLen, kind, kindLen);
  auto* samples = p + kHeaderSize + idLen + kindLen;
  if (prof.fmt == Fmt::F32)
  {
    if (n > 0)
      std::memcpy(samples, values, payload);
  }
  else
  {
    for (int i = 0; i < n; ++i)
      storeSample(samples + static_cast<std::size_t>(i) * bps, prof.fmt, values[i],
                  prof.scale, prof.bias);
  }
  return true;
}

struct Decoded
{
  std::string id;
  std::string kind;
  Fmt fmt = Fmt::F32;
  float scale = 1.f;
  float bias = 0.f;
  const std::uint8_t* payload = nullptr;
  int count = 0;
  std::size_t frameBytes = 0;
};

/**
 * Try to decode one complete frame at the front of `buf`.
 * Returns true when a full valid frame is present.
 * Incomplete → false + corrupt=false; bad header → false + corrupt=true.
 */
inline bool tryDecode(const char* buf, std::size_t len, Decoded& out, bool& corrupt)
{
  corrupt = false;
  out = {};
  if (!looksLikeMagic(buf, len))
    return false;
  if (len < kHeaderSize)
    return false;

  const auto* p = reinterpret_cast<const std::uint8_t*>(buf);
  if (p[4] != kVersion)
  {
    corrupt = true;
    return false;
  }
  const std::size_t idLen = p[5];
  const std::size_t kindLen = p[6];
  const auto fmt = static_cast<Fmt>(p[7]);
  if (fmt != Fmt::F32 && fmt != Fmt::I16 && fmt != Fmt::U8 && fmt != Fmt::I8)
  {
    corrupt = true;
    return false;
  }
  const std::uint32_t count = readU32Le(p + 8);
  const float scale = readF32Le(p + 12);
  const float bias = readF32Le(p + 16);
  if (idLen == 0 || idLen > kMaxIdLen || kindLen == 0 || kindLen > kMaxKindLen
      || count > kMaxSamples || !std::isfinite(scale) || !std::isfinite(bias))
  {
    corrupt = true;
    return false;
  }
  const std::size_t need =
    kHeaderSize + idLen + kindLen + static_cast<std::size_t>(count) * bytesPerSample(fmt);
  if (len < need)
    return false;

  out.id.assign(buf + kHeaderSize, idLen);
  out.kind.assign(buf + kHeaderSize + idLen, kindLen);
  out.fmt = fmt;
  out.scale = scale;
  out.bias = bias;
  out.count = static_cast<int>(count);
  out.payload = count ? (p + kHeaderSize + idLen + kindLen) : nullptr;
  out.frameBytes = need;
  return true;
}

/**
 * Wrap already-encoded CNXV frames into one CNXB batch (appended to `out`).
 * `frames` are contiguous CNXV blobs; `frameCount` must match.
 */
inline bool encodeBatch(std::vector<char>& out, const char* frames, std::size_t framesBytes,
                        std::uint32_t frameCount)
{
  if (frameCount == 0 || frameCount > kMaxBatchFrames)
    return false;
  if (framesBytes > 0 && !frames)
    return false;

  const std::size_t at = out.size();
  out.resize(at + kBatchHeaderSize + framesBytes);
  auto* p = reinterpret_cast<std::uint8_t*>(out.data() + at);
  p[0] = static_cast<std::uint8_t>(kMagic0);
  p[1] = static_cast<std::uint8_t>(kMagic1);
  p[2] = static_cast<std::uint8_t>(kMagic2);
  p[3] = static_cast<std::uint8_t>(kBatchMagic3);
  p[4] = kBatchVersion;
  p[5] = 0;
  p[6] = 0;
  p[7] = 0;
  writeU32Le(p + 8, frameCount);
  if (framesBytes > 0)
    std::memcpy(p + kBatchHeaderSize, frames, framesBytes);
  return true;
}

/**
 * Try to decode one complete CNXB batch at the front of `buf`.
 * On success, `payload` points at the concatenated CNXV region and
 * `frameCount` / `frameBytes` (total batch size) are set.
 */
inline bool tryDecodeBatch(const char* buf, std::size_t len, std::uint32_t& frameCount,
                           const char*& payload, std::size_t& payloadBytes,
                           std::size_t& batchBytes, bool& corrupt)
{
  corrupt = false;
  frameCount = 0;
  payload = nullptr;
  payloadBytes = 0;
  batchBytes = 0;
  if (!looksLikeBatchMagic(buf, len))
    return false;
  if (len < kBatchHeaderSize)
    return false;

  const auto* p = reinterpret_cast<const std::uint8_t*>(buf);
  if (p[4] != kBatchVersion)
  {
    corrupt = true;
    return false;
  }
  frameCount = readU32Le(p + 8);
  if (frameCount == 0 || frameCount > kMaxBatchFrames)
  {
    corrupt = true;
    return false;
  }

  // Walk CNXV frames to learn total size (and validate).
  std::size_t off = kBatchHeaderSize;
  for (std::uint32_t i = 0; i < frameCount; ++i)
  {
    if (off >= len)
      return false;
    Decoded dec;
    bool frameCorrupt = false;
    if (!tryDecode(buf + off, len - off, dec, frameCorrupt))
    {
      if (frameCorrupt)
      {
        corrupt = true;
        return false;
      }
      return false; // incomplete
    }
    off += dec.frameBytes;
  }

  payload = buf + kBatchHeaderSize;
  payloadBytes = off - kBatchHeaderSize;
  batchBytes = off;
  return true;
}

} // namespace VizBin
} // namespace Ui
} // namespace calfNXT
