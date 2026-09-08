#pragma once

#include "dsp_math.h"
#include "effect_base.h"
#include "io_stage.h"
#include "octaver_pitch_law.h"
#include "psola_shifter.h"
#include "sub_harmonic.h"
#include "viz_source.h"
#include "yin_detector.h"

#include "octaver_params.h"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <mutex>

namespace calfNXT {
namespace Octaver {

class OctaverPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  OctaverPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new OctaverPlugin);
  }

  Steinberg::tresult PLUGIN_API initialize(Steinberg::FUnknown* context) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setActive(Steinberg::TBool state) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setupProcessing(Steinberg::Vst::ProcessSetup& newSetup) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API process(Steinberg::Vst::ProcessData& data) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setState(Steinberg::IBStream* state) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API getState(Steinberg::IBStream* state) SMTG_OVERRIDE;
  Steinberg::uint32 PLUGIN_API getLatencySamples() SMTG_OVERRIDE;

  Ui::IVizSource* vizSource() override { return this; }
  int takeInputLevelsDb(float* out, int maxOut) override { return io_.takeInputLevelsDb(out, maxOut); }
  int takeOutputLevelsDb(float* out, int maxOut) override { return io_.takeOutputLevelsDb(out, maxOut); }
  int takePitchHistory(float* out, int maxOut) override;
  const char* vizPitchId() const override { return "octaver"; }
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(OctaverPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  static constexpr int kHistChannels = 5;
  static constexpr int kHistSlots = 512;
  static constexpr int kHistMinSlots = 48;
  static constexpr int kHistBufSize = kHistSlots * kHistChannels;
  static constexpr float kHistoryDisplayMs = 10000.f;

  // layerBits: dry=1, −1=2, −2=4, +1=8, sub=16
  struct BlockState
  {
    bool bypass = false;
    int profile = 0; // 0=bass, 1=cello, 2=voice, 3=guitar
    float quality = 0.75f;
    float octaveProtect = 0.9f;
    float unvoiced = 0.55f;
    int detect = 0;
    float fmin = 31.f;
    float fmax = 400.f;
    float glideMs = 40.f;
    float gateDb = -48.f;
    float attackMs = 8.f;

    bool dryOn = true;
    float dryLevelDb = 0.f;
    float dryBal = 0.f;
    bool dryListen = false;

    bool m1On = false;
    float m1LevelDb = -3.f;
    float m1Bal = 0.f;
    float m1Formant = 0.9f;
    float m1Tone = 0.45f;
    bool m1Listen = false;

    bool m2On = false;
    float m2LevelDb = -5.f;
    float m2Bal = 0.f;
    float m2Formant = 0.92f;
    float m2Tone = 0.3f;
    bool m2Listen = false;

    bool p1On = false;
    float p1LevelDb = -5.f;
    float p1Bal = 0.f;
    float p1Formant = 0.85f;
    float p1Tone = 0.6f;
    bool p1Listen = false;

    bool subOn = true;
    float subLevelDb = -4.f;
    float subBal = 0.f;
    int subWave = 0;
    float subHarm = 0.35f;
    float subTone = 0.35f;
    bool subListen = false;
  };

  struct ToneLp
  {
    float z = 0.f;
    void reset() { z = 0.f; }
    float process(float x, float tone, float sr)
    {
      tone = std::clamp(tone, 0.f, 1.f);
      const float fc = 120.f * std::pow(6000.f / 120.f, tone);
      const float a = 1.f - std::exp(-2.f * float(M_PI) * fc / std::max(1000.f, sr));
      z += a * (x - z);
      Dsp::sanitizeDenormal(z);
      return z;
    }
  };

  BlockState makeBlockState() const;
  void resetProcessing();
  void updateLatency(const BlockState& state, bool forceZero);
  int computeLatency(const BlockState& state) const;
  int detectDecimation() const;
  int yinWindow(const BlockState& state) const;
  int yinSource(int profile) const;
  void copyYinWindow(const BlockState& state, int latency);
  void histFeed(float inMidi, float layerBits, float conf, float flags);
  void publishHistSnapshot();
  static void balanceGains(float bal, float& gL, float& gR);

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;
  uint32_t latencySamples_ = 0;

  // Shared detect buffer lives in psolaM1_; m2/p1 only shift.
  Dsp::LinkedPsola psolaM1_;
  Dsp::LinkedPsola psolaM2_;
  Dsp::LinkedPsola psolaP1_;
  Dsp::YinDetector yin_;
  Dsp::SubHarmonic sub_;

  ToneLp toneM1L_, toneM1R_;
  ToneLp toneM2L_, toneM2R_;
  ToneLp toneP1L_, toneP1R_;

  float yinBuf_[Dsp::YinDetector::kMaxWin] {};
  int hopCount_ = 0;
  int hopSize_ = 256;
  Dsp::OctaverPitchState pitch_;
  float lastInMidi_ = 0.f;
  int duckHops_ = 0;
  int staleGateHops_ = 0;
  float wetGateSm_ = 0.f;
  int lastDetect_ = -1;
  int lastProfile_ = -1;

  // Live diagnostics: CALFNXT_OCTAVER_DIAG=1 → /tmp/calfnxt-octaver.log
  bool diagEnabled_ = false;
  bool diagChecked_ = false;
  bool diagParamsDumped_ = false;
  int64_t sampleCounter_ = 0;
  double diagM1Acc_ = 0.0;
  int diagM1N_ = 0;
  FILE* diagFile_ = nullptr;

  std::mutex histMutex_;
  float histBuf_[kHistBufSize] {};
  int histPos_ = 0;
  int histSampleCount_ = 0;
  int histSamplesPerSlot_ = 1;
  float histSnapshot_[kHistBufSize] {};
  int histSnapshotPos_ = 0;
  int histSnapshotSampleCount_ = 0;
  int histSnapshotSamplesPerSlot_ = 1;
  int histVisibleSlots_ = 160;
};

} // namespace Octaver
} // namespace calfNXT
