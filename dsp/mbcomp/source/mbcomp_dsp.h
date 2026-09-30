#pragma once

#include "effect_base.h"
#include "seq_lock.h"
#include "io_stage.h"
#include "channel_mode.h"
#include "compressor.h"
#include "gr_meter.h"
#include "band_splitter.h"
#include "peak_hold.h"
#include "spectrum_tap.h"
#include "viz_source.h"

#include "mbcomp_params.h"

#include <atomic>
#include <cstring>

namespace calfNXT {
namespace Mbcomp {

class MbcompPlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  static constexpr int kMaxBands = 6;

  MbcompPlugin();

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new MbcompPlugin);
  }

  Steinberg::tresult PLUGIN_API initialize(Steinberg::FUnknown* context) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setActive(Steinberg::TBool state) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setupProcessing(Steinberg::Vst::ProcessSetup& newSetup) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API process(Steinberg::Vst::ProcessData& data) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API setState(Steinberg::IBStream* state) SMTG_OVERRIDE;
  Steinberg::tresult PLUGIN_API getState(Steinberg::IBStream* state) SMTG_OVERRIDE;

  Ui::IVizSource* vizSource() override { return this; }
  int takeInputLevelsDb(float* out, int maxOut) override { return io_.takeInputLevelsDb(out, maxOut); }
  int takeOutputLevelsDb(float* out, int maxOut) override { return io_.takeOutputLevelsDb(out, maxOut); }
  int takeGainReductionDb(float* out, int maxOut) override;
  int takeDynamicsPoint(float* out, int maxOut) override;
  const char* vizDynamicsId() const override { return "mbcomp"; }
  int takeEnvelopeDisplay(float* out, int maxOut) override;
  const char* vizEnvelopeId() const override { return "mbcomp"; }
  int takeBandGainsDb(float* out, int maxOut) override;
  const char* vizBandGainsId() const override { return "mbcomp"; }
  int takeBandIoLevelsDb(float* out, int maxOut) override;
  const char* vizBandIoLevelsId() const override { return "mbcomp"; }
  int takeSpectrum(float* out, int maxOut) override;
  const char* vizSpectrumId() const override { return "fft_in"; }
  int takeOutputSpectrum(float* out, int maxOut) override;
  const char* vizOutputSpectrumId() const override { return "fft_out"; }
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(MbcompPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  // Per-band history: band post-GR (no makeup/mix), GR lin, thresh.
  static constexpr int kHistChannels = 3;
  static constexpr int kHistSlots = 512;
  static constexpr int kHistMinSlots = 48;
  static constexpr int kHistBufSize = kHistSlots * kHistChannels;

  struct BandState
  {
    float mix = 1.f;
    float dry = 0.f;
    float makeupLin = 1.f;
    float makeupDb = 0.f;
    float threshLin = 1.f;
    bool active = true;
    bool bypass = false;
    bool listen = false;
    Dsp::StereoLink link = Dsp::StereoLink::Max;
  };

  void resetProcessing();
  // Band-out × GR reconstructs pre via Cut expand — no separate trigger channel.
  void histFeedSample(int band, float bandOutPeak, float grLin, float threshLin);
  void publishHistSnapshot();
  void publishDynamicsPoints();
  int numBands() const;

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;

  Dsp::BandSplitter splitL_;
  Dsp::BandSplitter splitR_;
  Dsp::GainReduction gr_[kMaxBands];
  Dsp::GrMeter grMeter_[kMaxBands];
  Viz::LevelPeakHold bandInHold_[kMaxBands];
  Viz::LevelPeakHold bandOutHold_[kMaxBands];
  Dsp::SpectrumTap spectrumIn_;
  Dsp::SpectrumTap spectrumOut_;

  /* Operating points: plains per sample, atomics once per process(). */
  float pointInDbPlain_[kMaxBands] {};
  float pointOutDbPlain_[kMaxBands] {};
  std::atomic<float> pointInDb_[kMaxBands] {};
  std::atomic<float> pointOutDb_[kMaxBands] {};
  float lastGrDb_[kMaxBands] {};

  float histBuf_[kMaxBands][kHistBufSize] {};
  int histPos_[kMaxBands] {};
  int histSampleCount_[kMaxBands] {};
  int histSamplesPerSlot_ = 1;
  /* Snapshot published once per block from the audio thread, read on the UI
   * poll. Seqlock (odd/even sequence) — the audio thread never blocks; the
   * reader retries on a torn read. */
  Dsp::SeqLock histLock_;
  float histSnapshot_[kMaxBands][kHistBufSize] {};
  int histSnapshotPos_[kMaxBands] {};
  int histSnapshotSampleCount_[kMaxBands] {};
  int histSnapshotSamplesPerSlot_ = 1;
  int histVisibleSlots_ = 160;
  /** After one quiet zero-feed block, crossover state is drained. */
  bool quietDrained_ = false;
  /** Spectrum overlay parked after silence decayed to the floor. */
  bool spectrumFloor_ = false;
  /** Per-band soft bypass: 1 = active, 0 = fully bypassed. */
  float bypassSmooth_[kMaxBands] {};
};

} // namespace Mbcomp
} // namespace calfNXT
