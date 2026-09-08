// Offline Octaver via the REAL plugin DSP (OctaverPlugin::process).
// WAV → ProcessData blocks → same code path as the VST host.
// With CALFNXT_OCTAVER_DIAG=1 the plugin writes its hop log; this tool scores it.
//
//   cmake --build build --target calfnxt-offline-octaver
//   CALFNXT_OCTAVER_DIAG=1 ./build/tools/offline/calfnxt-offline-octaver \
//     --wav TAKE.wav --start 30 --sec 60 --preset cello

#include "octaver_dsp.h"
#include "process_harness.h"
#include "wav_io.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

namespace {

using calfNXT::Octaver::OctaverPlugin;
using namespace calfNXT::Octaver;
using namespace calfNXT::Offline;

struct HopRow
{
  float t = 0.f;
  float gate = 0.f;
  float rawF0 = 0.f;
  float f0 = 0.f;
  float lastF0 = 0.f;
  float conf = 0.f;
  float period = 0.f;
  float pSm = 0.f;
  float mix = 0.f;
  int grains = 0;
  int path = 0;
  float m1Db = -120.f;
  float detRms = -120.f;
  float flat = 0.f;
  int octSus = 0;
  int flag = 0; // former "bow" column — kept for log width; unused by scorer
};

bool parseHopLog(const char* path, std::vector<HopRow>& rows)
{
  FILE* f = std::fopen(path, "r");
  if (!f)
    return false;
  char line[512];
  while (std::fgets(line, sizeof(line), f))
  {
    if (line[0] == '#' || line[0] == '\n' || line[0] == '\0')
      continue;
    HopRow r;
    int grains = 0, path = 0, oct = 0, flag = 0;
    if (std::sscanf(line, "%f %f %f %f %f %f %f %f %f %d %d %f %f %f %d %d", &r.t, &r.gate,
                    &r.rawF0, &r.f0, &r.lastF0, &r.conf, &r.period, &r.pSm, &r.mix, &grains, &path,
                    &r.m1Db, &r.detRms, &r.flat, &oct, &flag) < 14)
      continue;
    r.grains = grains;
    r.path = path;
    r.octSus = oct;
    r.flag = flag;
    rows.push_back(r);
  }
  std::fclose(f);
  return !rows.empty();
}

void applyPreset(ProcessHarness& h, const char* name)
{
  // Matches UI Source defaults (octaverHost.ts) + Dry/−1 mix for listening tests.
  const bool voice = name && (!std::strcmp(name, "voice") || !std::strcmp(name, "vocals"));
  const bool bass = name && !std::strcmp(name, "bass");
  const bool guitar = name && !std::strcmp(name, "guitar");
  // default: cello (regression suite)

  h.setPlain(kParamInGain, 0.f);
  h.setPlain(kParamOutGain, 0.f);
  h.setPlain(kParamBypass, 0.f);
  h.setPlain(kParamDetect, 0.f); // Mid
  h.setPlain(kParamGlide, 40.f);
  h.setPlain(kParamGate, -48.f);
  h.setPlain(kParamAttack, 8.f);
  h.setPlain(kParamDryOn, 1.f);
  h.setPlain(kParamDryLevel, 0.f);
  h.setPlain(kParamM2On, 0.f);
  h.setPlain(kParamP1On, 0.f);
  h.setPlain(kParamM1Formant, 0.9f);
  h.setPlain(kParamM1Tone, 0.45f);

  if (voice)
  {
    h.setPlain(kParamProfile, 2.f);
    h.setPlain(kParamQuality, 0.75f);
    h.setPlain(kParamOctaveProtect, 0.88f);
    h.setPlain(kParamUnvoiced, 0.58f);
    h.setPlain(kParamFmin, 80.f);
    h.setPlain(kParamFmax, 700.f);
    h.setPlain(kParamM1On, 1.f);
    h.setPlain(kParamM1Level, -4.f);
    h.setPlain(kParamSubOn, 0.f);
  }
  else if (bass)
  {
    h.setPlain(kParamProfile, 0.f);
    h.setPlain(kParamQuality, 0.75f);
    h.setPlain(kParamOctaveProtect, 0.9f);
    h.setPlain(kParamUnvoiced, 0.55f);
    h.setPlain(kParamFmin, 31.f);
    h.setPlain(kParamFmax, 400.f);
    h.setPlain(kParamM1On, 0.f);
    h.setPlain(kParamM1Level, -5.f);
    h.setPlain(kParamSubOn, 1.f);
    h.setPlain(kParamSubLevel, -4.f);
  }
  else if (guitar)
  {
    h.setPlain(kParamProfile, 3.f);
    h.setPlain(kParamQuality, 0.7f);
    h.setPlain(kParamOctaveProtect, 0.8f);
    h.setPlain(kParamUnvoiced, 0.6f);
    h.setPlain(kParamFmin, 70.f);
    h.setPlain(kParamFmax, 1200.f);
    h.setPlain(kParamM1On, 1.f);
    h.setPlain(kParamM1Level, -5.f);
    h.setPlain(kParamSubOn, 1.f);
    h.setPlain(kParamSubLevel, -6.f);
  }
  else
  {
    h.setPlain(kParamProfile, 1.f);
    h.setPlain(kParamQuality, 0.8f);
    h.setPlain(kParamOctaveProtect, 0.88f);
    h.setPlain(kParamUnvoiced, 0.45f);
    h.setPlain(kParamFmin, 55.f);
    h.setPlain(kParamFmax, 700.f);
    h.setPlain(kParamM1On, 1.f);
    h.setPlain(kParamM1Level, -3.f);
    h.setPlain(kParamSubOn, 0.f);
  }
}

int scoreHops(const std::vector<HopRow>& hops)
{
  int unexplainedJumps = 0;
  int freezes = 0;
  int mismatch = 0;

  for (size_t i = 1; i < hops.size(); ++i)
  {
    const auto& a = hops[i - 1];
    const auto& b = hops[i];
    if (b.gate > 0.5f && b.pSm > 24.f)
    {
      const float rel = std::fabs(b.period - b.pSm) / b.pSm;
      if (rel > 0.10f)
        ++mismatch;
    }
    if (a.lastF0 < 20.f || b.lastF0 < 20.f)
      continue;
    const float lastRel = b.lastF0 / a.lastF0;
    if (lastRel > 1.20f || lastRel < 1.f / 1.20f)
    {
      // Explained: octave fold (raw≈2·f0) or fundamental prefer (f0≈2·raw).
      if (b.rawF0 > 20.f && b.f0 > 20.f &&
          (std::fabs(b.rawF0 / b.f0 - 2.f) < 0.18f || std::fabs(b.f0 / b.rawF0 - 2.f) < 0.18f))
        continue;
      float rawRel = 1.f;
      if (a.rawF0 > 20.f && b.rawF0 > 20.f)
        rawRel = b.rawF0 / a.rawF0;
      const bool rawStable = rawRel < 1.08f && rawRel > 1.f / 1.08f;
      const bool acceptedPath = b.path == 3 || b.path == 5 || b.path == 2;
      if (rawStable && acceptedPath)
        ++unexplainedJumps;
    }
  }

  const int freezeHops = std::max(1, int(1.0f / 0.008f));
  for (size_t i = 0; i + size_t(freezeHops) < hops.size(); ++i)
  {
    if (hops[i].lastF0 < 20.f)
      continue;
    bool flatLast = true;
    float rawMin = hops[i].rawF0, rawMax = hops[i].rawF0;
    for (int k = 0; k < freezeHops; ++k)
    {
      const auto& h = hops[i + size_t(k)];
      if (std::fabs(h.lastF0 - hops[i].lastF0) > 0.5f)
      {
        flatLast = false;
        break;
      }
      if (h.rawF0 > 20.f)
      {
        rawMin = std::min(rawMin, h.rawF0);
        rawMax = std::max(rawMax, h.rawF0);
      }
    }
    if (flatLast && rawMin > 20.f && rawMax / rawMin > 1.15f)
      ++freezes;
  }

  auto countUnexplainedIn = [&](float a, float b) {
    int c = 0;
    for (size_t i = 1; i < hops.size(); ++i)
    {
      if (hops[i].t < a || hops[i].t > b)
        continue;
      const auto& x = hops[i - 1];
      const auto& y = hops[i];
      if (x.lastF0 < 20.f || y.lastF0 < 20.f)
        continue;
      const float lastRel = y.lastF0 / x.lastF0;
      if (!(lastRel > 1.20f || lastRel < 1.f / 1.20f))
        continue;
      if (y.rawF0 > 20.f && y.f0 > 20.f &&
          (std::fabs(y.rawF0 / y.f0 - 2.f) < 0.18f || std::fabs(y.f0 / y.rawF0 - 2.f) < 0.18f))
        continue;
      float rawRel = 1.f;
      if (x.rawF0 > 20.f && y.rawF0 > 20.f)
        rawRel = y.rawF0 / x.rawF0;
      if (rawRel < 1.08f && rawRel > 1.f / 1.08f && (y.path == 3 || y.path == 5 || y.path == 2))
        ++c;
    }
    return c;
  };

  const int jump4143 = countUnexplainedIn(41.f, 43.f);
  const int jump5761 = countUnexplainedIn(57.f, 61.f);

  // Sustained octave-low lock: raw ≈ 2× last for a long stretch at high conf.
  // Brief folds during note changes (≤~1 s) are expected; the old bug held ~10 s.
  int octaveLowMs = 0;
  int octaveLowWorst = 0;
  for (size_t i = 0; i < hops.size(); ++i)
  {
    const auto& h = hops[i];
    if (h.gate > 0.5f && h.rawF0 > 40.f && h.lastF0 > 20.f && h.conf >= 0.70f &&
        h.rawF0 / h.lastF0 > 1.80f && h.rawF0 / h.lastF0 < 2.20f)
    {
      octaveLowMs += 8; // hop ≈ 8 ms
      octaveLowWorst = std::max(octaveLowWorst, octaveLowMs);
    }
    else
      octaveLowMs = 0;
  }

  std::printf("octaver_offline: hops=%zu unexplained_jumps=%d freezes=%d period_mismatch=%d\n",
              hops.size(), unexplainedJumps, freezes, mismatch);
  std::printf("octaver_offline: windows jump41-43=%d jump57-61=%d octave_low_worst_ms=%d\n",
              jump4143, jump5761, octaveLowWorst);

  const bool pass = freezes == 0 && jump4143 == 0 && jump5761 == 0 && octaveLowWorst < 1500 &&
                    unexplainedJumps * 50 <= int(hops.size()) &&
                    mismatch * 20 <= int(hops.size());
  std::printf("octaver_offline: %s\n", pass ? "PASS" : "FAIL");
  return pass ? 0 : 2;
}

} // namespace

int main(int argc, char** argv)
{
  const char* wavPath = nullptr;
  const char* outWav = nullptr;
  const char* logPath = "/tmp/calfnxt-octaver.log";
  const char* fixturePath = nullptr;
  const char* preset = "cello";
  float startSec = 30.f;
  float durSec = 60.f;
  int block = 512;
  int histSlots = 286; // match PitchRollChart ≈ width/3 for studio shots
  float gateOverride = 1e9f;   // unset
  float inGainOverride = 1e9f; // unset

  for (int i = 1; i < argc; ++i)
  {
    if (!std::strcmp(argv[i], "--wav") && i + 1 < argc)
      wavPath = argv[++i];
    else if (!std::strcmp(argv[i], "--out") && i + 1 < argc)
      outWav = argv[++i];
    else if (!std::strcmp(argv[i], "--log") && i + 1 < argc)
      logPath = argv[++i];
    else if (!std::strcmp(argv[i], "--fixture") && i + 1 < argc)
      fixturePath = argv[++i];
    else if (!std::strcmp(argv[i], "--hist-slots") && i + 1 < argc)
      histSlots = std::atoi(argv[++i]);
    else if (!std::strcmp(argv[i], "--preset") && i + 1 < argc)
      preset = argv[++i];
    else if (!std::strcmp(argv[i], "--start") && i + 1 < argc)
      startSec = float(std::atof(argv[++i]));
    else if (!std::strcmp(argv[i], "--sec") && i + 1 < argc)
      durSec = float(std::atof(argv[++i]));
    else if (!std::strcmp(argv[i], "--block") && i + 1 < argc)
      block = std::atoi(argv[++i]);
    else if (!std::strcmp(argv[i], "--gate") && i + 1 < argc)
      gateOverride = float(std::atof(argv[++i]));
    else if (!std::strcmp(argv[i], "--in-gain") && i + 1 < argc)
      inGainOverride = float(std::atof(argv[++i]));
  }
  if (!wavPath)
    wavPath = std::getenv("CALFNXT_OCTAVER_TEST_WAV");
  if (!wavPath)
  {
    std::fprintf(stderr,
                 "usage: %s --wav FILE [--preset cello|voice|bass|guitar] "
                 "[--start S] [--sec S] [--gate dB] [--in-gain dB] [--log FILE] "
                 "[--out FILE] [--fixture FILE] [--hist-slots N]\n",
                 argv[0]);
    return 1;
  }

  WavData wav;
  if (!readWav(wavPath, wav))
  {
    std::fprintf(stderr, "failed to read %s\n", wavPath);
    return 1;
  }
  std::vector<float> mono;
  toMono(wav, mono);

  const int i0 = std::clamp(int(startSec * wav.sampleRate), 0, int(mono.size()) - 1);
  const int i1 = std::clamp(i0 + int(durSec * wav.sampleRate), i0 + 1, int(mono.size()));
  const int n = i1 - i0;

  // Force plugin hop diag into a known path (same writer as the live host).
  setenv("CALFNXT_OCTAVER_DIAG", "1", 1);
  setenv("CALFNXT_OCTAVER_DIAG_LOG", logPath, 1);

  OctaverPlugin plugin;
  ProcessHarness harness(plugin);
  if (!harness.setup(double(wav.sampleRate), block))
  {
    std::fprintf(stderr, "plugin setup failed\n");
    return 1;
  }
  applyPreset(harness, preset);
  if (gateOverride < 1e8f)
    harness.setPlain(kParamGate, gateOverride);
  if (inGainOverride < 1e8f)
    harness.setPlain(kParamInGain, inGainOverride);
  if (fixturePath)
    plugin.configureVizBins(plugin.vizPitchId(), histSlots);

  std::vector<float> rendered(size_t(n), 0.f);
  harness.processMono(mono.data() + i0, rendered.data(), n);

  std::printf("octaver_offline: preset=%s processed %d samples @ %d Hz (latency=%u)\n", preset, n,
              wav.sampleRate, plugin.getLatencySamples());
  std::printf("octaver_offline: diag log → %s\n", logPath);

  if (outWav)
  {
    WavData out;
    out.sampleRate = wav.sampleRate;
    out.channels = 1;
    out.interleaved = rendered;
    if (!writeWavFloat32(outWav, out))
      std::fprintf(stderr, "warning: failed to write %s\n", outWav);
    else
      std::printf("octaver_offline: wrote %s\n", outWav);
  }

  if (fixturePath)
  {
    float inLv[8] {};
    float outLv[8] {};
    const int nIn = plugin.takeInputLevelsDb(inLv, 8);
    const int nOut = plugin.takeOutputLevelsDb(outLv, 8);
    constexpr int kMaxHist = 512 * 5 + 1;
    std::vector<float> hist(size_t(kMaxHist), 0.f);
    const int nHist = plugin.takePitchHistory(hist.data(), kMaxHist);
    FILE* f = std::fopen(fixturePath, "wb");
    if (!f)
    {
      std::fprintf(stderr, "failed to write fixture %s\n", fixturePath);
      return 1;
    }
    std::fprintf(f, "{\n  \"levelsIn\": [");
    for (int i = 0; i < std::max(1, nIn); ++i)
      std::fprintf(f, "%s%.5g", i ? ", " : "", double(inLv[i]));
    if (nIn < 2)
      std::fprintf(f, "%s-96", nIn ? ", " : "");
    std::fprintf(f, "],\n  \"levelsOut\": [");
    for (int i = 0; i < std::max(1, nOut); ++i)
      std::fprintf(f, "%s%.5g", i ? ", " : "", double(outLv[i]));
    if (nOut < 2)
      std::fprintf(f, "%s-96", nOut ? ", " : "");
    std::fprintf(f, "],\n  \"envelope\": [\n");
    for (int i = 0; i < nHist; ++i)
    {
      std::fprintf(f, "%s%.6g", i ? ((i % 5) == 0 ? ",\n    " : ", ") : "    ",
                   double(hist[size_t(i)]));
    }
    std::fprintf(f, "\n  ]\n}\n");
    std::fclose(f);
    std::printf("octaver_offline: wrote fixture %s (%d hist floats, slots≈%d)\n", fixturePath,
                nHist, histSlots);
    return 0;
  }

  std::vector<HopRow> hops;
  if (!parseHopLog(logPath, hops))
  {
    std::fprintf(stderr, "failed to parse hop log %s (diag not written?)\n", logPath);
    return 1;
  }
  // Shift log timestamps so they match absolute WAV time (plugin starts at t=0).
  for (auto& h : hops)
    h.t += startSec;

  return scoreHops(hops);
}
