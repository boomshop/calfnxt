#pragma once

// Minimal WAV reader/writer for offline DSP harnesses (PCM16 / float32, mono or stereo).

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace calfNXT {
namespace Offline {

struct WavData
{
  std::vector<float> interleaved; // frames * channels
  int sampleRate = 48000;
  int channels = 1;

  int frames() const
  {
    if (channels <= 0)
      return 0;
    return int(interleaved.size()) / channels;
  }
};

inline bool readWav(const char* path, WavData& out)
{
  FILE* f = std::fopen(path, "rb");
  if (!f)
    return false;
  char tag[5] {};
  if (std::fread(tag, 1, 4, f) != 4 || std::memcmp(tag, "RIFF", 4) != 0)
  {
    std::fclose(f);
    return false;
  }
  uint32_t riffSize = 0;
  std::fread(&riffSize, 4, 1, f);
  if (std::fread(tag, 1, 4, f) != 4 || std::memcmp(tag, "WAVE", 4) != 0)
  {
    std::fclose(f);
    return false;
  }

  uint16_t fmt = 0, ch = 0, bps = 0;
  uint32_t sr = 0;
  bool haveFmt = false, haveData = false;
  long dataPos = 0;
  uint32_t dataBytes = 0;
  while (!haveData)
  {
    if (std::fread(tag, 1, 4, f) != 4)
      break;
    uint32_t sz = 0;
    if (std::fread(&sz, 4, 1, f) != 1)
      break;
    if (std::memcmp(tag, "fmt ", 4) == 0)
    {
      std::fread(&fmt, 2, 1, f);
      std::fread(&ch, 2, 1, f);
      std::fread(&sr, 4, 1, f);
      std::fseek(f, 6, SEEK_CUR);
      std::fread(&bps, 2, 1, f);
      if (sz > 16)
        std::fseek(f, long(sz - 16), SEEK_CUR);
      haveFmt = true;
    }
    else if (std::memcmp(tag, "data", 4) == 0)
    {
      dataBytes = sz;
      dataPos = std::ftell(f);
      haveData = true;
      std::fseek(f, long(sz), SEEK_CUR);
    }
    else
      std::fseek(f, long(sz + (sz & 1)), SEEK_CUR);
  }
  if (!haveFmt || !haveData || (fmt != 1 && fmt != 3) || ch < 1)
  {
    std::fclose(f);
    return false;
  }

  out.sampleRate = int(sr);
  out.channels = int(ch);
  const int frameBytes = (fmt == 3 ? 4 : 2) * out.channels;
  const int nFrames = int(dataBytes / uint32_t(frameBytes));
  out.interleaved.assign(size_t(nFrames) * size_t(out.channels), 0.f);
  std::fseek(f, dataPos, SEEK_SET);
  if (fmt == 3)
  {
    std::fread(out.interleaved.data(), 4, out.interleaved.size(), f);
  }
  else
  {
    std::vector<int16_t> tmp(out.interleaved.size(), int16_t(0));
    std::fread(tmp.data(), 2, tmp.size(), f);
    for (size_t i = 0; i < tmp.size(); ++i)
      out.interleaved[i] = tmp[i] / 32768.f;
  }
  std::fclose(f);
  return true;
}

inline bool writeWavFloat32(const char* path, const WavData& in)
{
  FILE* f = std::fopen(path, "wb");
  if (!f)
    return false;
  const int nFrames = in.frames();
  const uint32_t dataBytes = uint32_t(nFrames * in.channels * 4);
  const uint32_t fmtSize = 16;
  const uint32_t riffSize = 4 + (8 + fmtSize) + (8 + dataBytes);
  auto w4 = [&](uint32_t v) { std::fwrite(&v, 4, 1, f); };
  auto w2 = [&](uint16_t v) { std::fwrite(&v, 2, 1, f); };
  std::fwrite("RIFF", 1, 4, f);
  w4(riffSize);
  std::fwrite("WAVE", 1, 4, f);
  std::fwrite("fmt ", 1, 4, f);
  w4(fmtSize);
  w2(3); // IEEE float
  w2(uint16_t(in.channels));
  w4(uint32_t(in.sampleRate));
  w4(uint32_t(in.sampleRate * in.channels * 4));
  w2(uint16_t(in.channels * 4));
  w2(32);
  std::fwrite("data", 1, 4, f);
  w4(dataBytes);
  std::fwrite(in.interleaved.data(), 4, in.interleaved.size(), f);
  std::fclose(f);
  return true;
}

/** Extract mono (average if stereo) into a contiguous buffer. */
inline void toMono(const WavData& in, std::vector<float>& mono)
{
  const int n = in.frames();
  mono.resize(size_t(n));
  if (in.channels <= 1)
  {
    mono = in.interleaved;
    return;
  }
  for (int i = 0; i < n; ++i)
  {
    double s = 0.0;
    for (int c = 0; c < in.channels; ++c)
      s += in.interleaved[size_t(i * in.channels + c)];
    mono[size_t(i)] = float(s / double(in.channels));
  }
}

} // namespace Offline
} // namespace calfNXT
