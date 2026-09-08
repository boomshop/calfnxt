// Offline Octaver regression probe — same YIN + pitch law + PSOLA −1 path as the plugin.
// Scores cold-start wet energy, gate dropouts, octave spikes, and wet RMS per window.
//
//   ./tools/run_octaver_regression.sh LABEL [--wav PATH]
//   /tmp/octaver_offline_test --wav TAKE.wav --suite cello --json

#include "psola_shifter.h"
#include "yin_detector.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>
#include <vector>

namespace {

constexpr float kPi = 3.14159265358979323846f;

struct Wav
{
  std::vector<float> samples;
  int sr = 48000;
};

struct Suite
{
  const char* id;
  int profile;
  int source;
  float quality;
  float octaveProtect;
  float unvoiced;
  float fmin;
  float fmax;
  float gateDb;
  float attackMs;
  float glideMs;
};

struct HopSample
{
  float t = 0.f;
  float f0 = 0.f;
  float rawF0 = 0.f;
  float conf = 0.f;
  float gate = 0.f;
  float wetRmsDb = -120.f;
  float period = 0.f;
  bool bowHold = false;
  bool octaveSuspect = false;
  bool levelOk = false;
  bool rawVoiced = false;
};

struct SegmentMetric
{
  float t0 = 0.f;
  float t1 = 0.f;
  int hops = 0;
  int voicedHops = 0;
  int gateOffHops = 0;
  int octaveSpikeHops = 0;
  float f0Min = 1e9f;
  float f0Max = 0.f;
  float wetRmsDbMin = 120.f;
  float wetRmsDbMax = -120.f;
  float wetRmsDbMean = -120.f;
};

struct RunMetrics
{
  std::string suite;
  std::string wav;
  int coldStartMs = 0;
  float coldStartWetDb = -120.f;
  bool coldStartOk = false;
  int totalGateOff = 0;
  int totalOctaveSpikes = 0;
  int silentWetHops = 0;
  std::vector<SegmentMetric> segments;
  std::vector<HopSample> marked;
};

const Suite kSuites[] = {
  {"cello", 1, 1, 1.f, 1.f, 0.45f, 25.f, 700.f, -48.f, 8.f, 40.f},
  {"bass", 0, 2, 0.75f, 0.9f, 0.55f, 31.f, 400.f, -48.f, 8.f, 40.f},
  {"voice", 2, 0, 0.75f, 0.85f, 0.55f, 80.f, 800.f, -48.f, 8.f, 40.f},
  {"guitar", 3, 2, 0.75f, 0.85f, 0.50f, 80.f, 1200.f, -48.f, 8.f, 40.f},
};

bool readWavMono(const char* path, Wav& out)
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
  uint32_t sr = 0, dataBytes = 0;
  bool haveFmt = false, haveData = false;
  long dataPos = 0;
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
      uint32_t br = 0;
      uint16_t ba = 0;
      std::fread(&br, 4, 1, f);
      std::fread(&ba, 2, 1, f);
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
  out.sr = int(sr);
  const int nSamp = int(dataBytes / (fmt == 3 ? 4 : 2));
  out.samples.resize(nSamp);
  std::fseek(f, dataPos, SEEK_SET);
  if (fmt == 3)
    std::fread(out.samples.data(), 4, nSamp, f);
  else
  {
    std::vector<int16_t> tmp(nSamp);
    std::fread(tmp.data(), 2, nSamp, f);
    for (int i = 0; i < nSamp; ++i)
      out.samples[i] = tmp[i] / 32768.f;
  }
  std::fclose(f);
  if (ch > 1)
  {
    std::vector<float> mono((nSamp + ch - 1) / ch);
    for (size_t i = 0; i < mono.size(); ++i)
    {
      double s = 0.0;
      for (int c = 0; c < ch; ++c)
        s += out.samples[i * ch + c];
      mono[i] = float(s / ch);
    }
    out.samples = std::move(mono);
  }
  return true;
}

int nextPow2(int v)
{
  int n = 1;
  while (n < v)
    n <<= 1;
  return n;
}

float linToDb(float x)
{
  return 20.f * std::log10(std::max(x, 1.0e-12f));
}

const Suite* findSuite(const char* id)
{
  for (const auto& s : kSuites)
    if (std::strcmp(s.id, id) == 0)
      return &s;
  return nullptr;
}

RunMetrics runOffline(const Wav& wav, float startSec, float durSec, const Suite& suite,
                      const std::vector<float>& markTimes,
                      const std::vector<std::pair<float, float>>& segWindows)
{
  using namespace calfNXT::Dsp;

  RunMetrics m;
  m.suite = suite.id;

  const int i0 = std::clamp(int(startSec * wav.sr), 0, int(wav.samples.size()) - 1);
  const int i1 = std::clamp(i0 + int(durSec * wav.sr), i0 + 1, int(wav.samples.size()));
  const float* in = wav.samples.data() + i0;
  const int n = i1 - i0;
  const float sr = float(wav.sr);

  LinkedPsola psola;
  YinDetector yin;
  psola.reset();
  yin.reset();

  const float winSec = 0.024f + 0.068f * std::clamp(suite.quality, 0.f, 1.f);
  const int win = std::clamp(nextPow2(std::max(256, int(sr * winSec))), 1024, YinDetector::kMaxWin);
  const int maxPeriod = std::max(64, int(sr / std::clamp(suite.fmin, 25.f, 400.f)));
  const int latency = std::clamp(win / 2 + maxPeriod + 32, 128, LinkedPsola::kSize / 4);
  const int hopSize = std::max(64, int(sr * 0.008f));

  float yinBuf[YinDetector::kMaxWin] {};
  int hopCount = 0;
  float hopPeriodFrom = 200.f;
  float hopPeriodTo = 200.f;
  float lastGoodPeriod = 0.f;
  float anchorF0 = 0.f;
  bool bowHoldActive = false;
  float lastF0 = 0.f;
  int leapHold = 0;
  int dryHops = 0;
  int staleGateHops = 0;
  float wetGate = 0.f;
  float wetGateSm = 0.f;
  float detectRmsDb = -90.f;

  const float attackSec = std::max(3.f, suite.attackMs) * 0.001f;
  const float releaseSec = std::max(0.006f, attackSec * 0.35f);
  psola.setMixSlew(attackSec, releaseSec, sr);
  const float attackCoeff = 1.f - std::exp(-1.f / std::max(1.f, attackSec * sr));
  const float glideCoeff =
    1.f - std::exp(-1.f / std::max(1.f, suite.glideMs * 0.001f * sr));

  m.segments.resize(segWindows.size());
  for (size_t i = 0; i < segWindows.size(); ++i)
  {
    m.segments[i].t0 = segWindows[i].first;
    m.segments[i].t1 = segWindows[i].second;
  }

  std::vector<HopSample> hops;
  hops.reserve(size_t(n / hopSize) + 4);

  int firstWetSample = -1;
  float wetAccCold = 0.f;
  int wetCountCold = 0;
  float hopWetAcc = 0.f;
  int hopWetCount = 0;
  HopSample pendingHop {};
  bool havePendingHop = false;

  for (int i = 0; i < n; ++i)
  {
    psola.write(in[i], in[i]);

    if (++hopCount >= hopSize)
    {
      if (havePendingHop && hopWetCount > 0)
      {
        const float wetRmsDb = linToDb(std::sqrt(hopWetAcc / float(hopWetCount)));
        HopSample hs = pendingHop;
        hs.wetRmsDb = wetRmsDb;
      hs.gate = wetGateSm;
      hops.push_back(hs);
      if (hs.gate > 0.9f && hs.rawVoiced && wetRmsDb < -50.f)
        ++m.silentWetHops;

      for (size_t si = 0; si < segWindows.size(); ++si)
        {
          if (hs.t < segWindows[si].first || hs.t > segWindows[si].second)
            continue;
          SegmentMetric& seg = m.segments[si];
          ++seg.hops;
          if (hs.rawVoiced)
            ++seg.voicedHops;
          if (hs.gate < 0.5f && hs.levelOk)
            ++seg.gateOffHops;
          if (anchorF0 > 1.f && hs.f0 > anchorF0 * 1.35f && hs.rawVoiced)
            ++seg.octaveSpikeHops;
          seg.f0Min = std::min(seg.f0Min, hs.f0);
          seg.f0Max = std::max(seg.f0Max, hs.f0);
          seg.wetRmsDbMin = std::min(seg.wetRmsDbMin, wetRmsDb);
          seg.wetRmsDbMax = std::max(seg.wetRmsDbMax, wetRmsDb);
          seg.wetRmsDbMean += wetRmsDb;
        }

        for (float mk : markTimes)
        {
          if (std::abs(hs.t - mk) < float(hopSize) / sr * 0.6f)
            m.marked.push_back(hs);
        }
      }

      hopCount = 0;

      const int half = win / 2;
      for (int k = 0; k < win; ++k)
        yinBuf[k] = psola.peekDetect(latency + half - k, 0);

      const bool reentry = dryHops >= 2;
      const auto yinRes = yin.analyze(
        yinBuf, win, sr, suite.fmin, suite.fmax, suite.unvoiced, suite.source, 0.55f);
      const float rawF0 = yinRes.f0Hz;
      const bool rawSpike =
        !reentry && yinRes.voiced && anchorF0 > 1.f && rawF0 > anchorF0 * 1.25f &&
        yinRes.confidence < 0.82f;
      if (rawSpike)
        bowHoldActive = true;
      if (bowHoldActive && anchorF0 > 1.f)
      {
        const float relToAnchor = rawF0 / anchorF0;
        if (relToAnchor > 0.92f && relToAnchor < 1.10f && yinRes.confidence > 0.78f)
          bowHoldActive = false;
      }
      const bool bowOvershoot =
        bowHoldActive && anchorF0 > 1.f && rawF0 > anchorF0 * 1.10f;
      float f0 = rawF0;
      const bool skipDouble =
        bowOvershoot ||
        (yinRes.voiced && anchorF0 > 1.f && rawF0 > anchorF0 * 1.40f && yinRes.confidence < 0.85f);
      if (yinRes.voiced && f0 > 1.f && !skipDouble)
        f0 = yin.preferFundamentalOverSubharmonic(f0, sr, suite.fmax, suite.source);
      if (bowOvershoot)
        f0 = anchorF0;
      else if (reentry && yinRes.voiced && f0 > 1.f)
      {
        if (anchorF0 > 1.f && f0 > anchorF0 * 1.30f && yinRes.confidence < 0.88f)
          f0 = anchorF0;
        else
          f0 = yin.preferSubharmonicOnAttack(f0, sr, suite.fmin, suite.source);
      }

      float rms = 0.f;
      for (int k = 0; k < win; ++k)
        rms += yinBuf[k] * yinBuf[k];
      rms = std::sqrt(rms / float(std::max(1, win)));
      detectRmsDb = linToDb(std::max(rms, 1.0e-9f));

      float period = hopPeriodTo;
      float gate = 0.f;
      const float prevWetGate = wetGate;
      bool periodHopSnap = false;
      const bool levelOk = detectRmsDb >= suite.gateDb;
      const bool rawVoiced =
        levelOk && yinRes.periodic && yinRes.confidence >= 0.28f && yinRes.flatness < 0.42f;

      auto applyPeriod = [&](float p, bool hardSnap) {
        period = std::max(16.f, p);
        lastGoodPeriod = period;
        periodHopSnap = true;
        if (hardSnap)
          psola.relockPeriod(period, 0.5f);
        else
          psola.nudgePeriod(period);
      };

      bool octaveCaution = false;
      if (rawVoiced && lastF0 > 1.f && f0 > 1.f && suite.octaveProtect > 0.05f)
      {
        const float rel = f0 / lastF0;
        const bool upOct = rel > 1.7f;
        const bool downOct = rel < (1.f / 1.7f);
        float confNeed = 0.55f + 0.35f * suite.octaveProtect;
        if (upOct)
          confNeed = 0.55f + 0.18f * suite.octaveProtect;
        if ((upOct || downOct) && yinRes.confidence < confNeed)
          octaveCaution = true;
        if (downOct && (yinRes.octaveSuspect || yinRes.confidence < 0.88f))
          octaveCaution = true;
      }

      if (bowOvershoot)
      {
        applyPeriod(
          anchorF0 > 1.f ? sr / anchorF0
                         : (lastGoodPeriod > 16.f ? lastGoodPeriod : hopPeriodTo),
          true);
        gate = 1.f;
        dryHops = 0;
        staleGateHops = 0;
      }
      else if (rawVoiced && f0 > 1.f)
      {
        const float pNew = sr / f0;
        const bool coldStart = lastGoodPeriod <= 16.f || lastF0 <= 20.f;
        if (reentry || coldStart)
        {
          applyPeriod(pNew, true);
          leapHold = 0;
          gate = 1.f;
        }
        else
        {
          const float rel = pNew / std::max(16.f, hopPeriodTo);
          const float freqRel = f0 / std::max(1.f, lastF0);
          if (rel > 1.7f || rel < (1.f / 1.7f))
          {
            if (!octaveCaution && freqRel > 1.7f && yinRes.confidence >= 0.85f)
            {
              applyPeriod(pNew, false);
              leapHold = 0;
              gate = 1.f;
            }
            else if (octaveCaution || rel > 1.7f)
            {
              period = lastGoodPeriod > 16.f ? lastGoodPeriod : hopPeriodTo;
              ++leapHold;
              gate = 1.f;
              if (leapHold >= 5 && rel < (1.f / 1.7f))
              {
                applyPeriod(pNew, false);
                leapHold = 0;
              }
            }
            else
            {
              leapHold = 0;
              gate = 1.f;
              period = hopPeriodTo + (pNew - hopPeriodTo) * (0.25f + 0.5f * glideCoeff);
              lastGoodPeriod = period;
            }
          }
          else
          {
            leapHold = 0;
            gate = 1.f;
            period = hopPeriodTo + (pNew - hopPeriodTo) * (0.25f + 0.5f * glideCoeff);
            lastGoodPeriod = period;
          }
        }
        dryHops = 0;
        lastF0 = f0;
        staleGateHops = 0;
        if (!bowOvershoot && yinRes.confidence > 0.78f)
          anchorF0 += (f0 - anchorF0) * 0.10f;
        else if (anchorF0 < 1.f && f0 > 1.f)
          anchorF0 = f0;
      }
      else if (levelOk && lastF0 > 20.f && dryHops < 5 && yinRes.voiced)
      {
        period = lastGoodPeriod > 16.f ? lastGoodPeriod : hopPeriodTo;
        gate = 1.f;
        dryHops = 0;
        staleGateHops = 0;
      }
      else if (levelOk && bowHoldActive && anchorF0 > 1.f)
      {
        period = sr / anchorF0;
        gate = 1.f;
        dryHops = 0;
        staleGateHops = 0;
      }
      else
      {
        leapHold = 0;
        ++dryHops;
        gate = 0.f;
        bowHoldActive = false;
        if (!rawVoiced)
          lastF0 *= 0.995f;
      }

      if (periodHopSnap)
      {
        const float p = std::max(16.f, period);
        hopPeriodFrom = hopPeriodTo = p;
      }
      else
      {
        hopPeriodFrom = hopPeriodTo;
        hopPeriodTo = std::max(16.f, period);
      }
      wetGate = gate;
      if (gate > 0.5f && (periodHopSnap || prevWetGate <= 0.5f))
      {
        wetGateSm = 1.f;
        psola.bootstrapMix();
      }
      if (gate > 0.5f)
        staleGateHops = 0;

      pendingHop.t = startSec + float(i) / sr;
      pendingHop.f0 = f0;
      pendingHop.rawF0 = rawF0;
      pendingHop.conf = yinRes.confidence;
      pendingHop.gate = wetGate;
      pendingHop.period = hopPeriodTo;
      pendingHop.bowHold = bowOvershoot;
      pendingHop.octaveSuspect = yinRes.octaveSuspect;
      pendingHop.levelOk = levelOk;
      pendingHop.rawVoiced = rawVoiced;
      havePendingHop = true;
      hopWetAcc = 0.f;
      hopWetCount = 0;
    }

    const float hopT = hopSize > 1 ? float(hopCount) / float(hopSize) : 1.f;
    float period = hopPeriodFrom + (hopPeriodTo - hopPeriodFrom) * hopT;
    if (wetGate > 0.5f && lastF0 > 20.f)
      period = lastGoodPeriod > 16.f ? lastGoodPeriod : (sr / lastF0);
    if (wetGate > 0.5f)
      wetGateSm = 1.f;
    else
      wetGateSm += (wetGate - wetGateSm) * attackCoeff;
    psola.setWetGate(wetGateSm);
    float wL = 0.f, wR = 0.f, dL = 0.f, dR = 0.f;
    psola.process(period, 0.5f, 0.9f, latency, wL, wR, dL, dR);
    const float wet = wL - dL;
    hopWetAcc += wet * wet;
    ++hopWetCount;

    const float relT = startSec + float(i) / sr;
    if (firstWetSample < 0 && wetGateSm > 0.5f && std::abs(wet) > 1.0e-5f)
      firstWetSample = i;
    if (relT - startSec < 3.f && wetGateSm > 0.5f)
    {
      wetAccCold += wet * wet;
      ++wetCountCold;
    }
  }

  if (havePendingHop && hopWetCount > 0)
  {
    const float wetRmsDb = linToDb(std::sqrt(hopWetAcc / float(hopWetCount)));
    HopSample hs = pendingHop;
    hs.wetRmsDb = wetRmsDb;
    hs.gate = wetGateSm;
    hops.push_back(hs);
  }

  for (auto& seg : m.segments)
    if (seg.hops > 0)
      seg.wetRmsDbMean /= float(seg.hops);

  m.coldStartMs = firstWetSample >= 0 ? int(1000.f * float(firstWetSample) / sr) : -1;
  m.coldStartWetDb =
    wetCountCold > 0 ? linToDb(std::sqrt(wetAccCold / float(wetCountCold))) : -120.f;
  m.coldStartOk = m.coldStartMs >= 0 && m.coldStartMs < 3000 && m.coldStartWetDb > -50.f;

  for (const auto& h : hops)
  {
    if (h.gate < 0.5f && h.levelOk)
      ++m.totalGateOff;
    if (h.f0 > 1.f && h.rawF0 > h.f0 * 1.35f && h.gate > 0.5f)
      ++m.totalOctaveSpikes;
  }

  return m;
}

void printHuman(const RunMetrics& m)
{
  std::printf("suite=%s\n", m.suite.c_str());
  std::printf("cold_start: %s  first_wet_ms=%d  wet_db=%.1f\n",
              m.coldStartOk ? "OK" : "FAIL", m.coldStartMs, m.coldStartWetDb);
  std::printf("totals: gate_off_hops=%d  octave_spike_hops=%d  silent_wet_hops=%d\n",
              m.totalGateOff, m.totalOctaveSpikes, m.silentWetHops);
  for (const auto& seg : m.segments)
  {
    std::printf(
      "segment %.1f-%.1fs: hops=%d voiced=%d gate_off=%d octave_spikes=%d f0=[%.0f..%.0f] "
      "wet_db=[%.1f..%.1f] mean=%.1f\n",
      seg.t0, seg.t1, seg.hops, seg.voicedHops, seg.gateOffHops, seg.octaveSpikeHops, seg.f0Min,
      seg.f0Max, seg.wetRmsDbMin, seg.wetRmsDbMax, seg.wetRmsDbMean);
  }
  for (const auto& h : m.marked)
  {
    std::printf("mark %.2fs: f0=%.1f raw=%.1f conf=%.2f gate=%.2f wet_db=%.1f period=%.0f%s%s\n",
                h.t, h.f0, h.rawF0, h.conf, h.gate, h.wetRmsDb, h.period,
                h.bowHold ? " BOW" : "", h.octaveSuspect ? " OCT?" : "");
  }
}

void printJson(const RunMetrics& m)
{
  std::printf("{\"suite\":\"%s\",\"cold_start_ok\":%s,\"cold_start_ms\":%d,"
              "\"cold_start_wet_db\":%.2f,\"gate_off_hops\":%d,\"octave_spike_hops\":%d,"
              "\"segments\":[",
              m.suite.c_str(), m.coldStartOk ? "true" : "false", m.coldStartMs, m.coldStartWetDb,
              m.totalGateOff, m.totalOctaveSpikes);
  for (size_t i = 0; i < m.segments.size(); ++i)
  {
    const auto& s = m.segments[i];
    if (i)
      std::printf(",");
    std::printf("{\"t0\":%.2f,\"t1\":%.2f,\"hops\":%d,\"voiced\":%d,\"gate_off\":%d,"
                "\"octave_spikes\":%d,\"f0_min\":%.1f,\"f0_max\":%.1f,\"wet_db_mean\":%.2f}",
                s.t0, s.t1, s.hops, s.voicedHops, s.gateOffHops, s.octaveSpikeHops, s.f0Min,
                s.f0Max, s.wetRmsDbMean);
  }
  std::printf("],\"marks\":[");
  for (size_t i = 0; i < m.marked.size(); ++i)
  {
    const auto& h = m.marked[i];
    if (i)
      std::printf(",");
    std::printf("{\"t\":%.3f,\"f0\":%.1f,\"raw_f0\":%.1f,\"conf\":%.3f,\"gate\":%.3f,"
                "\"wet_db\":%.2f,\"period\":%.0f,\"bow\":%s}",
                h.t, h.f0, h.rawF0, h.conf, h.gate, h.wetRmsDb, h.period,
                h.bowHold ? "true" : "false");
  }
  std::printf("]}\n");
}

bool appendHistory(const char* path, const char* label, const RunMetrics& m)
{
  std::ofstream out(path, std::ios::app);
  if (!out)
    return false;
  out << "{\"label\":\"" << label << "\",\"suite\":\"" << m.suite << "\",\"cold_start_ok\":"
      << (m.coldStartOk ? "true" : "false") << ",\"cold_start_ms\":" << m.coldStartMs
      << ",\"cold_start_wet_db\":" << m.coldStartWetDb << ",\"gate_off_hops\":" << m.totalGateOff
      << ",\"octave_spike_hops\":" << m.totalOctaveSpikes << "}\n";
  return true;
}

} // namespace

int main(int argc, char** argv)
{
  const char* wavPath = nullptr;
  const char* suiteId = "cello";
  const char* label = nullptr;
  const char* historyPath = nullptr;
  float startSec = 30.f;
  float durSec = 90.f;
  bool jsonOut = false;

  for (int i = 1; i < argc; ++i)
  {
    if (!std::strcmp(argv[i], "--wav") && i + 1 < argc)
      wavPath = argv[++i];
    else if (!std::strcmp(argv[i], "--suite") && i + 1 < argc)
      suiteId = argv[++i];
    else if (!std::strcmp(argv[i], "--start") && i + 1 < argc)
      startSec = std::atof(argv[++i]);
    else if (!std::strcmp(argv[i], "--sec") && i + 1 < argc)
      durSec = std::atof(argv[++i]);
    else if (!std::strcmp(argv[i], "--label") && i + 1 < argc)
      label = argv[++i];
    else if (!std::strcmp(argv[i], "--history") && i + 1 < argc)
      historyPath = argv[++i];
    else if (!std::strcmp(argv[i], "--json"))
      jsonOut = true;
  }

  if (!wavPath)
  {
    const char* env = std::getenv("CALFNXT_OCTAVER_TEST_WAV");
    if (env && env[0])
      wavPath = env;
  }
  if (!wavPath)
  {
    std::fprintf(stderr,
                 "usage: %s --wav FILE [--suite cello|bass|voice|guitar] [--start S] [--sec S] "
                 "[--json] [--label L] [--history PATH]\n"
                 "  or set CALFNXT_OCTAVER_TEST_WAV\n",
                 argv[0]);
    return 1;
  }

  const Suite* suite = findSuite(suiteId);
  if (!suite)
  {
    std::fprintf(stderr, "unknown suite %s\n", suiteId);
    return 1;
  }

  Wav wav;
  if (!readWavMono(wavPath, wav))
  {
    std::fprintf(stderr, "failed to read %s\n", wavPath);
    return 1;
  }

  std::vector<float> marks = {41.5f, 42.0f, 57.5f, 58.0f, 59.0f, 62.0f, 63.0f};
  std::vector<std::pair<float, float>> segments = {
    {30.f, 35.f},
    {41.f, 43.f},
    {57.f, 60.f},
    {62.f, 70.f},
    {80.f, 85.f},
  };

  RunMetrics metrics = runOffline(wav, startSec, durSec, *suite, marks, segments);
  metrics.wav = wavPath;

  if (jsonOut)
    printJson(metrics);
  else
    printHuman(metrics);

  if (historyPath && label)
    appendHistory(historyPath, label, metrics);

  const bool pass = metrics.coldStartOk && metrics.silentWetHops <= 2000 &&
                    metrics.segments[1].octaveSpikeHops == 0 &&
                    metrics.segments[2].octaveSpikeHops <= 2 &&
                    metrics.segments[1].gateOffHops == 0 &&
                    metrics.segments[1].wetRmsDbMean > -35.f &&
                    metrics.segments[2].wetRmsDbMean > -35.f &&
                    metrics.segments[3].wetRmsDbMean > -30.f &&
                    metrics.segments[0].wetRmsDbMax > -25.f;
  if (!jsonOut)
    std::printf("\nregression: %s\n", pass ? "PASS" : "FAIL");
  return pass ? 0 : 2;
}
