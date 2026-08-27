#pragma once

#include "effect_base.h"
#include "io_stage.h"
#include "compressor.h"
#include "gr_meter.h"
#include "band_splitter.h"
#include "peak_hold.h"
#include "viz_source.h"

#include "mbcomp_params.h"

#include <cstring>
#include <mutex>

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
  void configureVizBins(const char* id, int bins) override;

  OBJ_METHODS(MbcompPlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  // Per-band history: fullband peak, crossover peak, GR lin.
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
    bool active = true;
    bool bypass = false;
    bool listen = false;
    Dsp::StereoLink link = Dsp::StereoLink::Max;
  };

  void resetProcessing();
  void histFeedSample(int band, float fullPeak, float bandPeak, float grLin);
  void publishHistSnapshot();
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

  std::mutex vizMutex_;
  float pointInDb_[kMaxBands] {};
  float pointOutDb_[kMaxBands] {};
  float lastGrDb_[kMaxBands] {};

  float histBuf_[kMaxBands][kHistBufSize] {};
  int histPos_[kMaxBands] {};
  int histSampleCount_[kMaxBands] {};
  int histSamplesPerSlot_ = 1;
  std::mutex histMutex_;
  float histSnapshot_[kMaxBands][kHistBufSize] {};
  int histSnapshotPos_[kMaxBands] {};
  int histSnapshotSampleCount_[kMaxBands] {};
  int histSnapshotSamplesPerSlot_ = 1;
  int histVisibleSlots_ = 160;
  /** After one quiet zero-feed block, crossover state is drained. */
  bool quietDrained_ = false;
};

} // namespace Mbcomp
} // namespace calfNXT
