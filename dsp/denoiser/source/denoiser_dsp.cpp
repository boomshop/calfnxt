#include "denoiser_dsp.h"

#include "base/source/fstreamer.h"
#include "fp_flush.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace calfNXT {
namespace Denoiser {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5844u; // 'CNXD'
constexpr uint32 kStateVersion = 1;

bool jsonHasType(const char* s, const char* type)
{
  if (!s || !type)
    return false;
  char key[64];
  std::snprintf(key, sizeof(key), "\"t\":\"%s\"", type);
  return std::strstr(s, key) != nullptr;
}

bool jsonStringUnescape(const char* s, const char* key, std::string& out)
{
  out.clear();
  if (!s || !key)
    return false;
  const char* p = std::strstr(s, key);
  if (!p)
    return false;
  p = std::strchr(p + std::strlen(key), '"');
  if (!p)
    return false;
  ++p;
  while (*p && *p != '"')
  {
    if (*p == '\\' && p[1])
    {
      ++p;
      if (*p == 'n')
        out.push_back('\n');
      else if (*p == 't')
        out.push_back('\t');
      else
        out.push_back(*p);
      ++p;
      continue;
    }
    out.push_back(*p++);
  }
  return true;
}

int jsonInt(const char* s, const char* key, int fallback)
{
  if (!s || !key)
    return fallback;
  const char* p = std::strstr(s, key);
  if (!p)
    return fallback;
  p += std::strlen(key);
  while (*p == ' ' || *p == '\t' || *p == ':' || *p == '"')
    ++p;
  char* end = nullptr;
  const long v = std::strtol(p, &end, 10);
  if (end == p)
    return fallback;
  return static_cast<int>(v);
}

} // namespace

DenoiserPlugin::DenoiserPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API DenoiserPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

tresult PLUGIN_API DenoiserPlugin::setBusArrangements(SpeakerArrangement* inputs, int32 numIns,
                                                      SpeakerArrangement* outputs, int32 numOuts)
{
  // Mono track: one FFT. Stereo stays the default arrangement.
  if (numIns == 1 && numOuts == 1 && inputs && outputs &&
      inputs[0] == SpeakerArr::kMono && outputs[0] == SpeakerArr::kMono)
    return SingleComponentEffect::setBusArrangements(inputs, numIns, outputs, numOuts);
  return EffectBase::setBusArrangements(inputs, numIns, outputs, numOuts);
}

int DenoiserPlugin::qualityToFft(int quality)
{
  switch (std::clamp(quality, 0, 3))
  {
  case 0:
    return 1024;
  case 2:
    return 4096;
  case 3:
    return 8192;
  default:
    return 2048;
  }
}

int DenoiserPlugin::parseSlot(const char* json)
{
  // UI slots are 1…3; accept either "slot":N or path:"N".
  int slot = jsonInt(json, "\"slot\"", 0);
  if (slot < 1 || slot > 3)
  {
    std::string path;
    if (jsonStringUnescape(json, "\"path\"", path) && !path.empty())
      slot = std::atoi(path.c_str());
  }
  return slot;
}

void DenoiserPlugin::resetProcessing()
{
  denoiser_.reset();
  applyBlockState(makeBlockState());
  updateLatency();
}

void DenoiserPlugin::updateLatency()
{
  const uint32 want = denoiser_.latencySamples();
  if (want == latencySamples_)
    return;
  const bool had = latencySamples_ > 0;
  latencySamples_ = want;
  if (had && componentHandler)
    componentHandler->restartComponent(kLatencyChanged);
}

uint32 PLUGIN_API DenoiserPlugin::getLatencySamples()
{
  return latencySamples_;
}

tresult PLUGIN_API DenoiserPlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  return EffectBase::setActive(state);
}

tresult PLUGIN_API DenoiserPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  scratch64_.prepare(newSetup.maxSamplesPerBlock);
  denoiser_.setSampleRate(sampleRate_);
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

DenoiserPlugin::BlockState DenoiserPlugin::makeBlockState() const
{
  BlockState s;
  s.bypass = params_[kParamBypass] >= 0.5f;
  s.diffListen = params_[kParamDiffListen] >= 0.5f;
  s.profile = std::clamp(params_[kParamProfile], 1.f, 3.f);
  s.profileSnap = params_[kParamProfileMode] < 0.5f;
  if (s.profileSnap)
    s.profile = std::clamp(std::round(s.profile), 1.f, 3.f);
  s.blendMs = std::clamp(params_[kParamBlend], 10.f, 5000.f);
  s.amount = std::clamp(params_[kParamAmount], 0.f, 1.f);
  s.floor = std::clamp(params_[kParamFloor], -60.f, 0.f);
  s.fLo = std::clamp(params_[kParamFLo], 20.f, 20000.f);
  s.fHi = std::clamp(params_[kParamFHi], 20.f, 20000.f);
  s.loSlope = static_cast<int>(
    std::lround(std::clamp(params_[kParamFLoSlope], 0.f, 4.f)));
  s.hiSlope = static_cast<int>(
    std::lround(std::clamp(params_[kParamFHiSlope], 0.f, 4.f)));
  s.quality = static_cast<int>(std::lround(std::clamp(params_[kParamQuality], 0.f, 3.f)));
  s.listen = static_cast<int>(std::lround(std::clamp(params_[kParamListen], 0.f, 3.f)));
  s.mono = params_[kParamMono] >= 0.5f;
  s.spanDb = std::clamp(params_[kParamSpan], 3.f, 24.f);
  s.offsetDb = std::clamp(params_[kParamOffset], 0.f, 24.f);
  s.rms = params_[kParamDetect] >= 0.5f;
  s.octave = std::clamp(params_[kParamOctave], 0.f, 1.f);
  // Profile listen and Diff Listen are exclusive — profile listen wins.
  if (s.listen >= 1)
    s.diffListen = false;
  return s;
}

void DenoiserPlugin::applyBlockState(const BlockState& s)
{
  denoiser_.setFftSize(qualityToFft(s.quality));
  denoiser_.setParams(s.fLo, s.fHi, s.amount, s.floor, s.blendMs, s.loSlope,
                      s.hiSlope, s.spanDb, s.offsetDb, s.rms, s.octave);
  denoiser_.setProfilePos(s.profile - 1.f);
  denoiser_.setProfileListen(s.listen >= 1 ? s.listen - 1 : -1);
  updateLatency();
}

tresult PLUGIN_API DenoiserPlugin::process(ProcessData& data)
{
  Dsp::ScopedFlushDenormals flushDenormals;

  syncParamPlains(data, params_, kParamCount);

  const BlockState state = makeBlockState();
  applyBlockState(state);
  io_.setBypassGains(state.bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  // Flush profile UI even when the host sent no audio this block.
  if (denoiser_.takeProfilesDirty())
    pushProfilesUiJson();

  denoiser_.setVizActive(vizConsumerActive());

  const bool hasHostAudio = io_.begin(data);
  if (!hasHostAudio)
  {
    if (data.numSamples > 0 && data.numInputs > 0 && data.inputs
        && data.inputs[0].silenceFlags != 0)
      denoiser_.drainSilence(data.numSamples);
    return kResultOk;
  }

  const int32 nFrames = data.numSamples;
  if (nFrames <= 0)
  {
    io_.end(data);
    return kResultOk;
  }

  const int32 nCh = data.outputs[0].numChannels;
  const bool is32 = data.symbolicSampleSize == kSample32;
  const bool is64 = data.symbolicSampleSize == kSample64;
  float* left32 = nullptr;
  float* right32 = nullptr;
  double* left64 = nullptr;
  double* right64 = nullptr;
  if (is32)
  {
    auto** outs = data.outputs[0].channelBuffers32;
    if (!outs || !outs[0])
    {
      io_.end(data);
      return kResultOk;
    }
    left32 = outs[0];
    right32 = (nCh > 1 && outs[1]) ? outs[1] : nullptr;
  }
  else if (is64)
  {
    auto** outs = data.outputs[0].channelBuffers64;
    if (!outs || !outs[0] || scratch64_.capacity() <= 0)
    {
      io_.end(data);
      return kResultOk;
    }
    left64 = outs[0];
    right64 = (nCh > 1 && outs[1]) ? outs[1] : nullptr;
  }
  else
  {
    io_.end(data);
    return kResultOk;
  }

  bool ran = false;
  if (is32)
  {
    denoiser_.process(left32, right32, nFrames, state.bypass, state.diffListen,
                      state.mono);
    ran = true;
  }
  else if (left64 && scratch64_.capacity() > 0)
  {
    ran = scratch64_.process(left64, right64, nFrames,
                             [&](float* left, float* right, int32 n) {
                               denoiser_.process(left, right, n, state.bypass,
                                             state.diffListen, state.mono);
                             });
  }

  if (ran && vizConsumerActive())
    denoiser_.publish();

  io_.end(data);
  return kResultOk;
}

int DenoiserPlugin::takeSpectrum(float* out, int maxOut)
{
  return denoiser_.takeSpectrum(out, maxOut);
}

int DenoiserPlugin::takeOutputSpectrum(float* out, int maxOut)
{
  return denoiser_.takeActiveProfileSpectrum(out, maxOut);
}

int DenoiserPlugin::takeFreqResponse(float* out, int maxOut)
{
  return denoiser_.takeGrResponse(out, maxOut);
}

const char* DenoiserPlugin::vizExtraSpectrumId(int index) const
{
  static const char* kIds[Dsp::SpectralDenoiser::kNumProfiles] = {
    "denoiser_p1",
    "denoiser_p2",
    "denoiser_p3",
  };
  if (index < 0 || index >= Dsp::SpectralDenoiser::kNumProfiles)
    return nullptr;
  return kIds[index];
}

int DenoiserPlugin::takeExtraSpectrum(int index, float* out, int maxOut)
{
  return denoiser_.takeProfileSlotSpectrum(index, out, maxOut);
}

void DenoiserPlugin::configureVizBins(const char* id, int bins)
{
  if (!id)
    return;
  if (std::strcmp(id, "denoiser_mini") == 0)
  {
    denoiser_.configureProfileUiBins(bins);
    return;
  }
  if (std::strcmp(id, "fft") == 0 || std::strcmp(id, "denoiser") == 0
      || std::strcmp(id, "denoiser_prof") == 0)
    denoiser_.configureBins(bins);
}

void DenoiserPlugin::pushProfilesUiJson()
{
  // Curves travel as spectrum viz (denoiser_p1…p3). This message is only
  // which slots hold a fingerprint.
  std::string msg = "{\"t\":\"ir\",\"cmd\":\"profiles\",\"slots\":[";
  for (int s = 0; s < Dsp::SpectralDenoiser::kNumProfiles; ++s)
  {
    if (s > 0)
      msg += ',';
    msg += "{\"i\":";
    msg += std::to_string(s + 1);
    msg += ",\"valid\":";
    msg += denoiser_.profileValid(s) ? "1" : "0";
    msg += ",\"fft\":";
    msg += std::to_string(denoiser_.profileFftSize(s));
    msg += '}';
  }
  msg += "]}";
  std::lock_guard<std::mutex> lock(uiMutex_);
  pendingUiJson_ = std::move(msg);
}

bool DenoiserPlugin::handleIrCommand(const char* json)
{
  if (!json || !jsonHasType(json, "ir"))
    return false;
  std::string cmd;
  jsonStringUnescape(json, "\"cmd\"", cmd);
  if (cmd == "learn")
  {
    const int slot = parseSlot(json);
    if (slot >= 1 && slot <= 3)
    {
      // Switching slots finalizes the previous capture first.
      if (denoiser_.isLearning() && denoiser_.learnSlot() != slot - 1)
      {
        if (denoiser_.stopLearn())
          pushProfilesUiJson();
      }
      denoiser_.startLearn(slot - 1);
    }
    return true;
  }
  if (cmd == "stop")
  {
    const int slot = parseSlot(json);
    // Stop if idle-matching slot omitted, or if it matches the active learn.
    if (slot < 1 || slot > 3
        || (denoiser_.isLearning() && denoiser_.learnSlot() == slot - 1))
    {
      if (denoiser_.stopLearn())
        pushProfilesUiJson();
    }
    return true;
  }
  if (cmd == "clear")
  {
    const int slot = parseSlot(json);
    if (slot >= 1 && slot <= 3)
    {
      if (denoiser_.isLearning() && denoiser_.learnSlot() == slot - 1)
        denoiser_.cancelLearn();
      denoiser_.clearProfile(slot - 1);
      pushProfilesUiJson();
    }
    return true;
  }
  if (cmd == "sync")
  {
    pushProfilesUiJson();
    return true;
  }
  return true;
}

bool DenoiserPlugin::takeIrUiJson(std::string& out)
{
  std::lock_guard<std::mutex> lock(uiMutex_);
  if (pendingUiJson_.empty())
    return false;
  out = std::move(pendingUiJson_);
  pendingUiJson_.clear();
  return true;
}

tresult PLUGIN_API DenoiserPlugin::setState(IBStream* state)
{
  if (!state)
    return kResultFalse;

  IBStreamer streamer(state, kLittleEndian);
  uint32 magic = 0;
  uint32 version = 0;
  int32 count = 0;
  if (!streamer.readInt32u(magic) || magic != kStateMagic)
    return kResultFalse;
  if (!streamer.readInt32u(version) || version < 1 || version > kStateVersion)
    return kResultFalse;
  if (!streamer.readInt32(count) || count <= 0 || count > kParamCount)
    return kResultFalse;

  float plains[kParamCount];
  for (int i = 0; i < kParamCount; ++i)
  {
    if (auto* p = getParameterObject(static_cast<ParamID>(i)))
      plains[i] = static_cast<float>(p->toPlain(p->getNormalized()));
    else
      plains[i] = 0.f;
  }
  for (int i = 0; i < count; ++i)
  {
    if (!streamer.readFloat(plains[i]))
      return kResultFalse;
  }
  for (int i = 0; i < kParamCount; ++i)
  {
    if (auto* p = getParameterObject(static_cast<ParamID>(i)))
      p->setNormalized(p->toNormalized(plains[i]));
  }
  readParamPlains(params_, kParamCount);

  for (int s = 0; s < Dsp::SpectralDenoiser::kNumProfiles; ++s)
  {
    int32 valid = 0;
    int32 fftSize = 0;
    int32 nBins = 0;
    if (!streamer.readInt32(valid) || !streamer.readInt32(fftSize)
        || !streamer.readInt32(nBins))
      return kResultFalse;
    if (valid && fftSize > 0 && nBins > 0
        && nBins <= Dsp::SpectralDenoiser::kMaxHalf)
    {
      std::vector<float> power(static_cast<size_t>(nBins), 0.f);
      if (!streamer.readFloatArray(power.data(), nBins))
        return kResultFalse;
      denoiser_.setProfileRaw(s, fftSize, power.data(), nBins);
    }
    else
      denoiser_.clearProfile(s);
  }

  applyBlockState(makeBlockState());
  pushProfilesUiJson();
  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API DenoiserPlugin::getState(IBStream* state)
{
  if (!state)
    return kResultFalse;

  IBStreamer streamer(state, kLittleEndian);
  streamer.writeInt32u(kStateMagic);
  streamer.writeInt32u(kStateVersion);
  streamer.writeInt32(kParamCount);
  readParamPlains(params_, kParamCount);
  for (int i = 0; i < kParamCount; ++i)
    streamer.writeFloat(params_[i]);

  float power[Dsp::SpectralDenoiser::kMaxHalf];
  for (int s = 0; s < Dsp::SpectralDenoiser::kNumProfiles; ++s)
  {
    int fftSize = 0;
    const int n = denoiser_.getProfileRaw(s, power, Dsp::SpectralDenoiser::kMaxHalf, &fftSize);
    const bool valid = n > 0 && denoiser_.profileValid(s);
    streamer.writeInt32(valid ? 1 : 0);
    streamer.writeInt32(valid ? fftSize : 0);
    streamer.writeInt32(valid ? n : 0);
    if (valid)
      streamer.writeFloatArray(power, n);
  }
  return kResultOk;
}

} // namespace Denoiser
} // namespace calfNXT
