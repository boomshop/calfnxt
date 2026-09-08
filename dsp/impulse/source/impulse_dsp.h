#pragma once

#include "complementary_band_filter.h"
#include "delay_line.h"
#include "effect_base.h"
#include "io_stage.h"
#include "ir_library.h"
#include "partitioned_convolver.h"
#include "smooth_gain.h"
#include "viz_source.h"
#include "wav_load.h"

#include "impulse_params.h"

#include <atomic>
#include <condition_variable>
#include <deque>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace calfNXT {
namespace Impulse {

class ImpulsePlugin : public Plugin::EffectBase, public Ui::IVizSource
{
public:
  ImpulsePlugin();
  ~ImpulsePlugin() override;

  static Steinberg::FUnknown* createInstance(void*)
  {
    return static_cast<Steinberg::Vst::IAudioProcessor*>(new ImpulsePlugin);
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
  int takeIrWaveform(float* out, int maxOut) override;
  const char* vizIrWaveId() const override { return "impulse"; }
  void configureVizBins(const char* id, int bins) override;
  bool handleIrCommand(const char* json) override;
  bool takeIrUiJson(std::string& out) override;

  OBJ_METHODS(ImpulsePlugin, Plugin::EffectBase)
  DEFINE_INTERFACES
  END_DEFINE_INTERFACES(Plugin::EffectBase)
  REFCOUNT_METHODS(Plugin::EffectBase)

protected:
  const char* editorHtml() const override { return kEditorHtml; }

private:
  struct BlockState
  {
    bool bypass = false;
    bool reverse = false;
    float decay = 1.f;
    float predelayMs = 0.f;
    float hipass = 60.f;
    float lopass = 10000.f;
    int hpStages = 2;
    int lpStages = 0;
    float dryDb = 0.f;
    float wetDb = -12.f;
    int source = 0;
    float shape = 4.f;
    int quality = 2;
  };

  enum class JobKind
  {
    None,
    Scan,
    Load,
    Rebuild
  };

  BlockState makeBlockState() const;
  void resetProcessing();
  void updateLatency();
  void startWorker();
  void stopWorker();
  void workerLoop();
  void queueJob(JobKind kind, std::string path = {});
  void runScan(const std::string& root);
  void runLoad(const std::string& relOrAbs);
  void runRebuild();
  void resetLoadPlains();
  void writePlain(Steinberg::Vst::ParamID id, float plain);
  void pushUiJson(std::string json);
  void rebuildPreparedLocked();
  void appendTreeUiFieldsLocked(std::string& json);
  void ensureAncestorsOpenLocked();
  void setStatus(const std::string& msg);
  void publishPendingConv(std::shared_ptr<Dsp::PartitionedStereoConvolver> eng);
  void takePendingConv(bool bypass);
  void enterBypass();
  void ensureScratch(int n);
  static std::string lastLibraryPath();
  static void saveLastLibraryPath(const std::string& root);

  float params_[kParamCount] {};
  Dsp::IoStage io_;
  double sampleRate_ = 44100.0;
  Steinberg::uint32 latencySamples_ = 0;

  Dsp::ComplementaryBandFilter tone_;
  Dsp::StereoDelayXfade<65536> dryDelay_;
  Dsp::StereoDelayXfade<131072> wetPredelay_;
  Dsp::SmoothGain dryGain_;
  Dsp::SmoothGain wetGain_;

  std::shared_ptr<Dsp::PartitionedStereoConvolver> conv_;
  std::shared_ptr<Dsp::PartitionedStereoConvolver> convPrev_;
  std::shared_ptr<Dsp::PartitionedStereoConvolver> convPending_;
  std::atomic<bool> convReady_ {false};
  int xfadeLeft_ = 0;
  int xfadeLen_ = 0;
  bool bypassLatched_ = false;
  int dryFlushLeft_ = 0;

  std::vector<float> scratchWetL_;
  std::vector<float> scratchWetR_;
  std::vector<float> scratchPrevL_;
  std::vector<float> scratchPrevR_;

  std::mutex dataMutex_;
  Dsp::IrBuffer rawIr_;
  Dsp::IrBuffer preparedIr_;
  Dsp::IrBuffer displayIr_;
  std::string libraryRoot_;
  std::string selectedRel_;
  std::string treeJson_ = "[]";
  std::string status_;
  std::vector<std::string> openDirs_;
  int treeScroll_ = 0;
  float origLengthMs_ = 0.f;
  std::vector<float> waveDb_;
  std::atomic<int> waveBins_ {256};
  std::atomic<bool> waveDirty_ {true};
  bool haveIr_ = false;

  std::mutex uiMutex_;
  std::string pendingUiJson_;

  struct Job
  {
    JobKind kind = JobKind::None;
    std::string path;
  };
  std::mutex jobMutex_;
  std::condition_variable jobCv_;
  std::deque<Job> jobs_;
  std::atomic<bool> workerRun_ {false};
  std::thread worker_;

  float lastDecay_ = 1.f;
  bool lastReverse_ = false;
  float lastShape_ = 4.f;
  int lastQuality_ = 2;
  int rebuildHold_ = 0;
  std::atomic<float> decayPlain_ {1.f};
  std::atomic<int> reverseFlag_ {0};
  std::atomic<float> shapePlain_ {4.f};
  std::atomic<int> qualityPlain_ {2};
  std::atomic<double> workerSr_ {44100.0};
};

} // namespace Impulse
} // namespace calfNXT
