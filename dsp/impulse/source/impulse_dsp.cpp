#include "impulse_dsp.h"

#include "base/source/fstreamer.h"
#include "dsp_math.h"
#include "gain_util.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sys/stat.h>

namespace calfNXT {
namespace Impulse {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5849u; // 'CNXI'
constexpr uint32 kStateVersion = 2;
constexpr float kMaxIrSeconds = 16.f;
constexpr int kMaxLibraryFiles = 8000;
constexpr int kXfadeMs = 30;

bool jsonHasType(const char* s, const char* type)
{
  char needle[40];
  std::snprintf(needle, sizeof needle, "\"t\":\"%s\"", type);
  return s && std::strstr(s, needle);
}

bool jsonStringUnescape(const char* s, const char* key, std::string& out)
{
  out.clear();
  if (!s || !key)
    return false;
  const char* p = std::strstr(s, key);
  if (!p)
    return false;
  p = std::strchr(p, ':');
  if (!p)
    return false;
  ++p;
  while (*p == ' ' || *p == '\t')
    ++p;
  if (*p != '"')
    return false;
  ++p;
  while (*p && *p != '"')
  {
    if (*p == '\\' && p[1])
    {
      ++p;
      out.push_back(*p == 'n' ? '\n' : *p);
      ++p;
      continue;
    }
    out.push_back(*p++);
  }
  return *p == '"';
}

void jsonEscapeAppend(std::string& out, const std::string& in)
{
  Dsp::jsonEscapeAppend(out, in);
}

constexpr int kMaxOpenDirs = 512;
constexpr int kMaxOpenPath = 2048;

void parseTreeUiBlob(const std::string& blob, std::vector<std::string>& open, int& scroll)
{
  open.clear();
  scroll = 0;
  if (blob.empty())
    return;
  size_t i = 0;
  while (i < blob.size() && blob[i] != '\n')
    ++i;
  try
  {
    scroll = std::stoi(blob.substr(0, i));
  }
  catch (...)
  {
    scroll = 0;
  }
  scroll = std::clamp(scroll, 0, 1'000'000);
  if (i < blob.size())
    ++i;
  while (i < blob.size() && static_cast<int>(open.size()) < kMaxOpenDirs)
  {
    size_t j = blob.find('\n', i);
    if (j == std::string::npos)
      j = blob.size();
    if (j > i)
    {
      std::string p = blob.substr(i, j - i);
      if (p.size() <= static_cast<size_t>(kMaxOpenPath))
        open.push_back(std::move(p));
    }
    i = j + 1;
  }
}

bool writeStr(IBStreamer& s, const std::string& v)
{
  const int32 n = static_cast<int32>(v.size());
  if (!s.writeInt32(n))
    return false;
  if (n <= 0)
    return true;
  return s.writeRaw(v.data(), n) == n;
}

bool readStr(IBStreamer& s, std::string& v)
{
  int32 n = 0;
  if (!s.readInt32(n) || n < 0 || n > 16 * 1024 * 1024)
    return false;
  v.assign(static_cast<size_t>(n), '\0');
  if (n == 0)
    return true;
  return s.readRaw(v.data(), n) == n;
}

std::string configDir()
{
  const char* home = std::getenv("HOME");
  if (!home || !home[0])
    return {};
  return std::string(home) + "/.config/calfnxt";
}

/** Wet feed only. Dry stays the original stereo. 0=Stereo 1=L 2=R 3=L+R. */
void mapWetSource(float inL, float inR, int source, float& wL, float& wR)
{
  switch (source)
  {
    case 1:
      wL = inL;
      wR = inL;
      break;
    case 2:
      wL = inR;
      wR = inR;
      break;
    case 3:
    {
      const float m = 0.5f * (inL + inR);
      wL = m;
      wR = m;
      break;
    }
    default:
      wL = inL;
      wR = inR;
      break;
  }
}
} // namespace

ImpulsePlugin::ImpulsePlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
  startWorker();
}

ImpulsePlugin::~ImpulsePlugin()
{
  stopWorker();
  /* A convolver still waiting for the audio thread to adopt it is freed here,
   * on the main thread. */
  delete pendingConv_.exchange(nullptr, std::memory_order_acq_rel);
}

void ImpulsePlugin::startWorker()
{
  if (workerRun_.load())
    return;
  workerRun_.store(true);
  worker_ = std::thread([this] { workerLoop(); });
}

void ImpulsePlugin::stopWorker()
{
  {
    std::lock_guard<std::mutex> lock(jobMutex_);
    workerRun_.store(false);
  }
  jobCv_.notify_all();
  if (worker_.joinable())
    worker_.join();
  /* Worker is gone and the host has stopped processing: free whatever the
   * audio thread retired last. */
  drainRetiredConvs();
}

void ImpulsePlugin::queueJob(JobKind kind, std::string path)
{
  if (kind == JobKind::Rebuild)
  {
    /* Lock-free path — process() requests rebuilds from the audio thread.
     * The worker polls this flag on a bounded 25 ms wait, so there is no
     * mutex and no condvar signal here. Repeated requests coalesce (rebuilds
     * are idempotent). */
    rebuildRequested_.store(true, std::memory_order_release);
    return;
  }
  {
    std::lock_guard<std::mutex> lock(jobMutex_);
    jobs_.push_back(Job{kind, std::move(path)});
  }
  jobCv_.notify_one();
}

void ImpulsePlugin::workerLoop()
{
  while (true)
  {
    Job job;
    bool rebuild = false;
    {
      std::unique_lock<std::mutex> lock(jobMutex_);
      jobCv_.wait_for(lock, std::chrono::milliseconds(25), [&] {
        return !workerRun_.load() || !jobs_.empty()
               || rebuildRequested_.load(std::memory_order_acquire);
      });
      if (!workerRun_.load() && jobs_.empty())
        return;
      if (rebuildRequested_.exchange(false, std::memory_order_acq_rel))
        rebuild = true;
      if (!jobs_.empty())
      {
        job = std::move(jobs_.front());
        jobs_.pop_front();
      }
    }
    /* Free convolvers the audio thread retired — deallocation stays off the
     * realtime path. */
    drainRetiredConvs();
    if (rebuild)
      runRebuild();
    if (job.kind == JobKind::Scan)
      runScan(job.path);
    else if (job.kind == JobKind::Load)
      runLoad(job.path);
  }
}

void ImpulsePlugin::pushUiJson(std::string json)
{
  std::lock_guard<std::mutex> lock(uiMutex_);
  pendingUiJson_ = std::move(json);
}

void ImpulsePlugin::setStatus(const std::string& msg)
{
  std::lock_guard<std::mutex> lock(dataMutex_);
  status_ = msg;
}

void ImpulsePlugin::publishPendingConv(std::unique_ptr<Dsp::PartitionedStereoConvolver> eng)
{
  /* Worker thread (or setState on the UI thread). Publish the raw pointer
   * with one atomic exchange — the audio thread adopts it in
   * takePendingConv(). A previously published convolver the audio thread
   * never consumed comes back from the exchange and is deleted here, off the
   * realtime path. */
  delete pendingConv_.exchange(eng.release(), std::memory_order_acq_rel);
}

void ImpulsePlugin::takePendingConv(bool bypass)
{
  /* Audio thread. Lock-free: one atomic exchange, no mutex, no heap. */
  if (retireOverflow_)
    retireConv(std::move(retireOverflow_));
  Dsp::PartitionedStereoConvolver* pend =
    pendingConv_.exchange(nullptr, std::memory_order_acq_rel);
  if (!pend)
    return;
  std::unique_ptr<Dsp::PartitionedStereoConvolver> next(pend);
  if (bypass)
  {
    retireConv(std::move(convPrev_));
    retireConv(std::move(conv_));
    conv_ = std::move(next);
    xfadeLeft_ = 0;
  }
  else
  {
    retireConv(std::move(convPrev_));
    convPrev_ = std::move(conv_);
    conv_ = std::move(next);
    const float sr = static_cast<float>(sampleRate_ > 0.0 ? sampleRate_ : 44100.0);
    xfadeLen_ = std::max(64, static_cast<int>(sr * (kXfadeMs * 0.001f)));
    xfadeLeft_ = convPrev_ ? xfadeLen_ : 0;
  }
  updateLatency();
}

void ImpulsePlugin::retireConv(std::unique_ptr<Dsp::PartitionedStereoConvolver>&& eng)
{
  /* Audio thread. Move the old convolver into the SPSC retire ring; the
   * worker destroys it. Never free FFT buffers here. */
  if (!eng)
    return;
  const unsigned h = retireHead_.load(std::memory_order_relaxed);
  const unsigned t = retireTail_.load(std::memory_order_acquire);
  if (h - t < static_cast<unsigned>(kRetireCap))
  {
    /* The slot is null (consumer cleared it before publishing the tail), so
     * this move-assignment runs no deleter. */
    retireBuf_[h % kRetireCap] = std::move(eng);
    retireHead_.store(h + 1, std::memory_order_release);
    return;
  }
  if (!retireOverflow_)
  {
    /* Ring momentarily full (worker has not drained yet): hold and retry on
     * the next block. */
    retireOverflow_ = std::move(eng);
    return;
  }
  if (&eng == &retireOverflow_)
    return; // overflow retry with the ring still full — keep holding it
  /* Unreachable while the worker drains each loop iteration (retirements only
   * ever follow worker publishes, at most two per process block). Leak a
   * heap-owned unique_ptr holder rather than free FFT buffers on the
   * realtime thread (tiny alloc vs FFT teardown). */
  new std::unique_ptr<Dsp::PartitionedStereoConvolver>(std::move(eng));
}

void ImpulsePlugin::drainRetiredConvs()
{
  /* Worker / shutdown thread only: destroy what the audio thread retired. */
  unsigned t = retireTail_.load(std::memory_order_relaxed);
  const unsigned h = retireHead_.load(std::memory_order_acquire);
  while (t != h)
  {
    retireBuf_[t % kRetireCap].reset();
    ++t;
  }
  retireTail_.store(t, std::memory_order_release);
}

void ImpulsePlugin::enterBypass()
{
  if (conv_)
    conv_->reset();
  retireConv(std::move(convPrev_));
  xfadeLeft_ = 0;
  tone_.reset();
  wetPredelay_.reset();
}

void ImpulsePlugin::prepareScratch(int n)
{
  const size_t s = static_cast<size_t>(std::max(0, n));
  if (scratchWetL_.size() < s)
  {
    scratchWetL_.resize(s);
    scratchWetR_.resize(s);
    scratchPrevL_.resize(s);
    scratchPrevR_.resize(s);
  }
}

std::string ImpulsePlugin::lastLibraryPath()
{
  const std::string p = configDir() + "/impulse-library";
  std::ifstream in(p);
  std::string line;
  if (in && std::getline(in, line))
  {
    while (!line.empty() && (line.back() == '\r' || line.back() == ' '))
      line.pop_back();
    return line;
  }
  return {};
}

void ImpulsePlugin::saveLastLibraryPath(const std::string& root)
{
  const std::string dir = configDir();
  if (dir.empty() || root.empty())
    return;
  ::mkdir(dir.c_str(), 0755);
  std::ofstream out(dir + "/impulse-library", std::ios::trunc);
  if (out)
    out << root << '\n';
}

tresult PLUGIN_API ImpulsePlugin::initialize(FUnknown* context)
{
  const tresult r = EffectBase::initialize(context);
  if (r != kResultOk)
    return r;
  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  const std::string last = lastLibraryPath();
  if (!last.empty())
    queueJob(JobKind::Scan, last);
  return kResultOk;
}

void ImpulsePlugin::resetProcessing()
{
  const float sr = static_cast<float>(sampleRate_);
  tone_.setSampleRate(sr);
  tone_.reset();
  dryDelay_.reset();
  wetPredelay_.reset();
  dryDelay_.setXfadeLen(std::max(16, static_cast<int>(sr * 0.005f)));
  wetPredelay_.setXfadeLen(std::max(16, static_cast<int>(sr * 0.005f)));
  dryGain_.setSampleRate(sr);
  wetGain_.setSampleRate(sr);
  dryGain_.setInertiaMs(10.f);
  wetGain_.setInertiaMs(10.f);
  dryGain_.reset(Dsp::dbToLin(params_[kParamDry]));
  wetGain_.reset(Dsp::dbToLin(params_[kParamAmount]));
  workerSr_.store(sampleRate_, std::memory_order_relaxed);
  decayPlain_.store(std::clamp(params_[kParamDecay], 0.15f, 1.f), std::memory_order_relaxed);
  reverseFlag_.store(params_[kParamReverse] >= 0.5f ? 1 : 0, std::memory_order_relaxed);
  shapePlain_.store(std::clamp(params_[kParamShape], Dsp::kIrShapeMin, Dsp::kIrShapeMax),
                    std::memory_order_relaxed);
  qualityPlain_.store(std::clamp(static_cast<int>(std::lround(params_[kParamQuality])), 0, 2),
                      std::memory_order_relaxed);
  lastQuality_ = qualityPlain_.load(std::memory_order_relaxed);
  if (conv_)
    conv_->reset();
  if (convPrev_)
    convPrev_->reset();
  xfadeLeft_ = 0;
  bypassLatched_ = params_[kParamBypass] >= 0.5f;
  dryFlushLeft_ = 0;
  updateLatency();
}

void ImpulsePlugin::updateLatency()
{
  const uint32 want = conv_ && !conv_->empty()
                        ? static_cast<uint32>(Dsp::PartitionedStereoConvolver::kHop)
                        : 0u;
  if (want == latencySamples_)
    return;
  const bool had = latencySamples_ > 0;
  latencySamples_ = want;
  // Same Ableton setActive ping-pong as Bender: never notify on 0<->N.
  if (had && componentHandler)
    componentHandler->restartComponent(kLatencyChanged);
}

uint32 PLUGIN_API ImpulsePlugin::getLatencySamples()
{
  return latencySamples_;
}

tresult PLUGIN_API ImpulsePlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  return EffectBase::setActive(state);
}

tresult PLUGIN_API ImpulsePlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  /* Pre-allocate scratch for the largest block the host may deliver — the
   * audio thread must never resize these buffers. */
  prepareScratch(std::max(static_cast<int>(newSetup.maxSamplesPerBlock), 8192));
  resetProcessing();
  {
    std::lock_guard<std::mutex> lock(dataMutex_);
    if (haveIr_ && rawIr_.frames > 0)
      queueJob(JobKind::Rebuild);
  }
  return EffectBase::setupProcessing(newSetup);
}

ImpulsePlugin::BlockState ImpulsePlugin::makeBlockState() const
{
  BlockState s;
  s.bypass = params_[kParamBypass] >= 0.5f;
  s.reverse = params_[kParamReverse] >= 0.5f;
  s.decay = std::clamp(params_[kParamDecay], 0.15f, 1.f);
  s.predelayMs = std::clamp(params_[kParamPredelay], 0.f, 500.f);
  s.hipass = params_[kParamHipass];
  s.lopass = params_[kParamLopass];
  s.hpStages = Dsp::complementaryModeToStages(params_[kParamHpMode]);
  s.lpStages = Dsp::complementaryModeToStages(params_[kParamLpMode]);
  s.dryDb = params_[kParamDry];
  s.wetDb = params_[kParamAmount];
  s.source = std::clamp(static_cast<int>(std::lround(params_[kParamSource])), 0, 3);
  s.shape = std::clamp(params_[kParamShape], Dsp::kIrShapeMin, Dsp::kIrShapeMax);
  s.quality = std::clamp(static_cast<int>(std::lround(params_[kParamQuality])), 0, 2);
  return s;
}

void ImpulsePlugin::rebuildPreparedLocked()
{
  preparedIr_ = rawIr_;
  Dsp::trimIrMaxSeconds(preparedIr_, kMaxIrSeconds);
  const float sr = static_cast<float>(workerSr_.load(std::memory_order_relaxed));
  Dsp::resampleIr(preparedIr_, sr > 0.f ? sr : 44100.f);
  Dsp::normalizeIr(preparedIr_, 0.5f);
  origLengthMs_.store(preparedIr_.frames > 0 && preparedIr_.sampleRate > 0.f
                        ? 1000.f * static_cast<float>(preparedIr_.frames) / preparedIr_.sampleRate
                        : 0.f,
                      std::memory_order_relaxed);
  const bool rev = reverseFlag_.load(std::memory_order_relaxed) != 0;
  displayIr_ = preparedIr_;
  const int bins = std::clamp(waveBins_.load(std::memory_order_relaxed), 48, kMaxWaveBins);
  /* Seqlock publish (dataMutex_ is held against other writers; the UI reader
   * never locks). irEnvelopeDb fills every bin. */
  waveSeq_.fetch_add(1, std::memory_order_release); // odd: write in progress
  waveDbSize_ = bins;
  Dsp::irEnvelopeDb(displayIr_, waveDb_, bins);
  waveSeq_.fetch_add(1, std::memory_order_release); // even: stable
  Dsp::applyDecay(preparedIr_, decayPlain_.load(std::memory_order_relaxed),
                  shapePlain_.load(std::memory_order_relaxed));
  if (rev)
    Dsp::reverseIr(preparedIr_);
  Dsp::collapseIrChannels(preparedIr_,
                          Dsp::irQualityMaxChannels(qualityPlain_.load(std::memory_order_relaxed)));
  waveDirty_.store(true);
}

void ImpulsePlugin::runScan(const std::string& root)
{
  if (root.empty())
    return;
  setStatus("Scanning…");
  int n = 0;
  std::string err;
  const std::string tree = Dsp::scanIrLibraryJson(root, kMaxLibraryFiles, n, err);
  {
    std::lock_guard<std::mutex> lock(dataMutex_);
    libraryRoot_ = root;
    treeJson_ = tree;
    status_ = err.empty() ? (std::to_string(n) + " files") : err;
  }
  saveLastLibraryPath(root);
  std::string json = "{\"t\":\"ir\",\"cmd\":\"tree\",\"root\":";
  jsonEscapeAppend(json, root);
  json += ",\"sel\":";
  {
    std::lock_guard<std::mutex> lock(dataMutex_);
    jsonEscapeAppend(json, selectedRel_);
    json += ",\"status\":";
    jsonEscapeAppend(json, status_);
    appendTreeUiFieldsLocked(json);
  }
  json += ",\"tree\":";
  json += tree;
  json += '}';
  pushUiJson(std::move(json));
}

void ImpulsePlugin::ensureAncestorsOpenLocked()
{
  const std::string& rel = selectedRel_;
  size_t pos = 0;
  while (true)
  {
    const auto slash = rel.find('/', pos);
    if (slash == std::string::npos)
      break;
    const std::string folder = rel.substr(0, slash);
    if (!folder.empty()
        && std::find(openDirs_.begin(), openDirs_.end(), folder) == openDirs_.end()
        && static_cast<int>(openDirs_.size()) < kMaxOpenDirs)
      openDirs_.push_back(folder);
    pos = slash + 1;
  }
}

void ImpulsePlugin::appendTreeUiFieldsLocked(std::string& json)
{
  json += ",\"scroll\":";
  json += std::to_string(treeScroll_);
  json += ",\"open\":[";
  for (size_t i = 0; i < openDirs_.size(); ++i)
  {
    if (i)
      json += ',';
    jsonEscapeAppend(json, openDirs_[i]);
  }
  json += ']';
}

void ImpulsePlugin::writePlain(ParamID id, float plain)
{
  if (auto* p = getParameterObject(id))
    p->setNormalized(p->toNormalized(plain));
  if (id < static_cast<ParamID>(kParamCount))
    params_[id] = plain;
}

void ImpulsePlugin::resetLoadPlains()
{
  writePlain(kParamDecay, 1.f);
  writePlain(kParamReverse, 0.f);
  decayPlain_.store(1.f, std::memory_order_relaxed);
  reverseFlag_.store(0, std::memory_order_relaxed);
  lastDecay_ = 1.f;
  lastReverse_ = false;
}

void ImpulsePlugin::runLoad(const std::string& relOrAbs)
{
  std::string root;
  {
    std::lock_guard<std::mutex> lock(dataMutex_);
    root = libraryRoot_;
  }
  std::string path = relOrAbs;
  if (!path.empty() && path[0] != '/' && !root.empty())
    path = root + "/" + relOrAbs;
  setStatus("Loading…");
  Dsp::IrBuffer ir;
  std::string err;
  if (!Dsp::loadIrFile(path.c_str(), ir, &err))
  {
    setStatus(err.empty() ? "load failed" : err);
    std::string json = "{\"t\":\"ir\",\"cmd\":\"status\",\"status\":";
    jsonEscapeAppend(json, err.empty() ? "load failed" : err);
    json += '}';
    pushUiJson(std::move(json));
    return;
  }
  const auto slash = path.find_last_of('/');
  ir.name = slash == std::string::npos ? path : path.substr(slash + 1);
  resetLoadPlains();
  Dsp::IrBuffer prep;
  {
    std::lock_guard<std::mutex> lock(dataMutex_);
    rawIr_ = std::move(ir);
    selectedRel_ = relOrAbs;
    haveIr_ = rawIr_.frames > 0;
    ensureAncestorsOpenLocked();
    rebuildPreparedLocked();
    prep = preparedIr_;
  }
  auto eng = std::make_unique<Dsp::PartitionedStereoConvolver>();
  eng->setIr(prep.interleaved.data(), prep.frames, prep.channels);
  {
    std::lock_guard<std::mutex> lock(dataMutex_);
    status_ = rawIr_.name;
  }
  publishPendingConv(std::move(eng));
  std::string json = "{\"t\":\"ir\",\"cmd\":\"sel\",\"path\":";
  jsonEscapeAppend(json, relOrAbs);
  json += ",\"status\":";
  {
    std::lock_guard<std::mutex> lock(dataMutex_);
    jsonEscapeAppend(json, status_);
  }
  json += '}';
  pushUiJson(std::move(json));
}

void ImpulsePlugin::runRebuild()
{
  Dsp::IrBuffer prep;
  {
    std::lock_guard<std::mutex> lock(dataMutex_);
    if (!haveIr_ || rawIr_.frames < 1)
      return;
    rebuildPreparedLocked();
    prep = preparedIr_;
  }
  auto eng = std::make_unique<Dsp::PartitionedStereoConvolver>();
  eng->setIr(prep.interleaved.data(), prep.frames, prep.channels);
  publishPendingConv(std::move(eng));
}

bool ImpulsePlugin::handleIrCommand(const char* json)
{
  if (!json || !jsonHasType(json, "ir"))
    return false;
  std::string cmd;
  jsonStringUnescape(json, "\"cmd\"", cmd);
  if (cmd == "root")
  {
    std::string path;
    if (jsonStringUnescape(json, "\"path\"", path) && !path.empty())
      queueJob(JobKind::Scan, path);
    return true;
  }
  if (cmd == "select")
  {
    std::string path;
    if (jsonStringUnescape(json, "\"path\"", path) && !path.empty())
      queueJob(JobKind::Load, path);
    return true;
  }
  if (cmd == "rescan")
  {
    std::string root;
    {
      std::lock_guard<std::mutex> lock(dataMutex_);
      root = libraryRoot_;
    }
    if (!root.empty())
      queueJob(JobKind::Scan, root);
    return true;
  }
  if (cmd == "ui")
  {
    std::string blob;
    jsonStringUnescape(json, "\"path\"", blob);
    std::vector<std::string> open;
    int scroll = 0;
    parseTreeUiBlob(blob, open, scroll);
    std::lock_guard<std::mutex> lock(dataMutex_);
    openDirs_ = std::move(open);
    treeScroll_ = scroll;
    return true;
  }
  if (cmd == "sync")
  {
    std::string root, sel, status, tree;
    std::string msg = "{\"t\":\"ir\",\"cmd\":\"tree\",\"root\":";
    {
      std::lock_guard<std::mutex> lock(dataMutex_);
      root = libraryRoot_;
      sel = selectedRel_;
      status = status_;
      tree = treeJson_;
      jsonEscapeAppend(msg, root);
      msg += ",\"sel\":";
      jsonEscapeAppend(msg, sel);
      msg += ",\"status\":";
      jsonEscapeAppend(msg, status);
      appendTreeUiFieldsLocked(msg);
    }
    msg += ",\"tree\":";
    msg += tree.empty() ? "[]" : tree;
    msg += '}';
    pushUiJson(std::move(msg));
    waveDirty_.store(true);
    return true;
  }
  return true;
}

bool ImpulsePlugin::takeIrUiJson(std::string& out)
{
  std::lock_guard<std::mutex> lock(uiMutex_);
  if (pendingUiJson_.empty())
    return false;
  out = std::move(pendingUiJson_);
  pendingUiJson_.clear();
  return true;
}

int ImpulsePlugin::takeIrWaveform(float* out, int maxOut)
{
  if (!out || maxOut < 3)
    return 0;
  if (!waveDirty_.load(std::memory_order_relaxed))
    return 0;
  /* Seqlock read (same pattern as the compressor's takeEnvelopeDisplay):
   * retry while a writer is mid-publish, never take dataMutex_ — the worker
   * may hold it for a whole IR rebuild. */
  for (int attempt = 0; attempt < 8; ++attempt)
  {
    const uint32_t s0 = waveSeq_.load(std::memory_order_acquire);
    if (s0 & 1u)
      continue; // write in progress
    const int bins = waveDbSize_;
    const float origMs = origLengthMs_.load(std::memory_order_relaxed);
    const float used = origMs * decayPlain_.load(std::memory_order_relaxed);
    int n = 3;
    if (bins >= 1 && maxOut >= 3 + bins)
    {
      out[0] = static_cast<float>(bins);
      std::memcpy(out + 3, waveDb_, sizeof(float) * static_cast<size_t>(bins));
      n = 3 + bins;
    }
    else
    {
      out[0] = 0.f;
    }
    out[1] = origMs;
    out[2] = used;
    const uint32_t s1 = waveSeq_.load(std::memory_order_acquire);
    if (s0 == s1)
    {
      waveDirty_.store(false, std::memory_order_relaxed);
      return n;
    }
  }
  return 0; // contended; the next poll retries
}

void ImpulsePlugin::configureVizBins(const char* id, int bins)
{
  if (!id || std::strcmp(id, "impulse") != 0)
    return;
  bins = std::clamp(bins, 48, kMaxWaveBins);
  if (waveBins_.exchange(bins) == bins)
    return;
  std::lock_guard<std::mutex> lock(dataMutex_);
  waveSeq_.fetch_add(1, std::memory_order_release); // odd: write in progress
  waveDbSize_ = bins;
  Dsp::irEnvelopeDb(displayIr_, waveDb_, bins); // fills dbMin when no IR
  waveSeq_.fetch_add(1, std::memory_order_release); // even: stable
  waveDirty_.store(true);
}

tresult PLUGIN_API ImpulsePlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);
  const BlockState state = makeBlockState();
  decayPlain_.store(state.decay, std::memory_order_relaxed);
  reverseFlag_.store(state.reverse ? 1 : 0, std::memory_order_relaxed);
  shapePlain_.store(state.shape, std::memory_order_relaxed);
  qualityPlain_.store(state.quality, std::memory_order_relaxed);

  takePendingConv(state.bypass);

  if (state.bypass != bypassLatched_)
  {
    bypassLatched_ = state.bypass;
    if (state.bypass)
      enterBypass();
  }

  if (std::fabs(state.decay - lastDecay_) > 0.0005f || state.reverse != lastReverse_
      || std::fabs(state.shape - lastShape_) > 0.01f || state.quality != lastQuality_)
  {
    lastDecay_ = state.decay;
    lastReverse_ = state.reverse;
    lastShape_ = state.shape;
    lastQuality_ = state.quality;
    rebuildHold_ = 6;
  }
  if (rebuildHold_ > 0 && --rebuildHold_ == 0)
    queueJob(JobKind::Rebuild);

  io_.setBypassGains(state.bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);
  dryGain_.set(Dsp::dbToLin(state.dryDb));
  wetGain_.set(Dsp::dbToLin(state.wetDb));
  if (!state.bypass)
    tone_.setParams(state.hipass, state.lopass, state.hpStages, state.lpStages);

  const bool hasHostAudio = io_.begin(data);
  if (!hasHostAudio)
    return kResultOk;

  const int32 nFrames = data.numSamples;
  const int32 nCh = data.outputs[0].numChannels;
  const float sr = static_cast<float>(sampleRate_ > 0.0 ? sampleRate_ : 44100.0);
  const int drySamps = conv_ && !conv_->empty() ? conv_->latency() : 0;
  const int preSamps = std::max(0, static_cast<int>(std::lround(state.predelayMs * 0.001f * sr)));
  const bool quietIn = io_.inputWasQuiet();
  if (!quietIn)
    dryFlushLeft_ = drySamps + Dsp::PartitionedStereoConvolver::kHop;
  else
    dryFlushLeft_ = std::max(0, dryFlushLeft_ - nFrames);

  // Bypass: latency-matched dry only — never run the partitioned FFT.
  if (state.bypass && quietIn && dryFlushLeft_ <= 0)
  {
    io_.end(data);
    return kResultOk;
  }

  auto delayDry = [&](auto** out) {
    for (int32 i = 0; i < nFrames; ++i)
    {
      float inL = nCh <= 0 ? 0.f : static_cast<float>(out[0][i]);
      float inR = nCh <= 1 ? inL : static_cast<float>(out[1][i]);
      float dryL = 0.f, dryR = 0.f;
      dryDelay_.process(inL, inR, drySamps, dryL, dryR);
      out[0][i] = dryL;
      if (nCh > 1)
        out[1][i] = dryR;
    }
  };

  if (state.bypass)
  {
    if (data.symbolicSampleSize == kSample32)
      delayDry(data.outputs[0].channelBuffers32);
    else
      delayDry(data.outputs[0].channelBuffers64);
    io_.end(data);
    return kResultOk;
  }

  const bool convIdle = !conv_ || conv_->empty() || conv_->canIdle();
  const bool prevIdle = !convPrev_ || xfadeLeft_ <= 0;
  if (quietIn && convIdle && prevIdle && dryFlushLeft_ <= 0 && preSamps <= 0)
  {
    io_.end(data);
    return kResultOk;
  }

  auto runWet = [&](auto** out) {
    /* Host exceeded setupProcessing maxSamplesPerBlock — refuse to alloc. */
    if (static_cast<int>(scratchWetL_.size()) < nFrames)
      return;
    float* wetL = scratchWetL_.data();
    float* wetR = scratchWetR_.data();
    const bool foldMono =
      conv_ && conv_->layout() == Dsp::PartitionedStereoConvolver::Layout::Mono;
    for (int32 i = 0; i < nFrames; ++i)
    {
      float inL = nCh <= 0 ? 0.f : static_cast<float>(out[0][i]);
      float inR = nCh <= 1 ? inL : static_cast<float>(out[1][i]);
      mapWetSource(inL, inR, state.source, wetL[i], wetR[i]);
      if (foldMono)
      {
        const float m = 0.5f * (wetL[i] + wetR[i]);
        wetL[i] = m;
        wetR[i] = m;
      }
      float dL = 0.f, dR = 0.f;
      dryDelay_.process(inL, inR, drySamps, dL, dR);
      out[0][i] = dL;
      if (nCh > 1)
        out[1][i] = dR;
    }

    const bool doPrev = convPrev_ && xfadeLeft_ > 0;
    if (doPrev)
    {
      std::memcpy(scratchPrevL_.data(), wetL, sizeof(float) * static_cast<size_t>(nFrames));
      std::memcpy(scratchPrevR_.data(), wetR, sizeof(float) * static_cast<size_t>(nFrames));
      convPrev_->process(scratchPrevL_.data(), scratchPrevR_.data(), nFrames);
    }

    if (conv_ && !conv_->empty())
      conv_->process(wetL, wetR, nFrames);
    else
    {
      std::memset(wetL, 0, sizeof(float) * static_cast<size_t>(nFrames));
      std::memset(wetR, 0, sizeof(float) * static_cast<size_t>(nFrames));
    }

    if (doPrev)
    {
      const float* pL = scratchPrevL_.data();
      const float* pR = scratchPrevR_.data();
      for (int32 i = 0; i < nFrames && xfadeLeft_ > 0; ++i)
      {
        const float t =
          1.f - static_cast<float>(xfadeLeft_) / static_cast<float>(std::max(1, xfadeLen_));
        const float a = std::sin(t * 1.5707963267948966f);
        const float b = std::cos(t * 1.5707963267948966f);
        wetL[i] = pL[i] * b + wetL[i] * a;
        wetR[i] = pR[i] * b + wetR[i] * a;
        if (--xfadeLeft_ <= 0)
          retireConv(std::move(convPrev_));
      }
    }

    for (int32 i = 0; i < nFrames; ++i)
    {
      float pdL = 0.f, pdR = 0.f;
      wetPredelay_.process(wetL[i], wetR[i], preSamps, pdL, pdR);
      pdL = tone_.processWet(0, pdL);
      pdR = tone_.processWet(1, pdR);
      const float gD = dryGain_.get();
      const float gW = wetGain_.get();
      float yL = static_cast<float>(out[0][i]) * gD + pdL * gW;
      float yR = (nCh > 1 ? static_cast<float>(out[1][i]) : yL) * gD + pdR * gW;
      Dsp::sanitizeDenormal(yL);
      Dsp::sanitizeDenormal(yR);
      out[0][i] = yL;
      if (nCh > 1)
        out[1][i] = yR;
    }
  };

  if (data.symbolicSampleSize == kSample32)
    runWet(data.outputs[0].channelBuffers32);
  else
    runWet(data.outputs[0].channelBuffers64);

  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API ImpulsePlugin::setState(IBStream* state)
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
  decayPlain_.store(std::clamp(params_[kParamDecay], 0.15f, 1.f), std::memory_order_relaxed);
  reverseFlag_.store(params_[kParamReverse] >= 0.5f ? 1 : 0, std::memory_order_relaxed);
  shapePlain_.store(std::clamp(params_[kParamShape], Dsp::kIrShapeMin, Dsp::kIrShapeMax),
                    std::memory_order_relaxed);
  lastDecay_ = decayPlain_.load(std::memory_order_relaxed);
  lastReverse_ = reverseFlag_.load(std::memory_order_relaxed) != 0;
  lastShape_ = shapePlain_.load(std::memory_order_relaxed);
  qualityPlain_.store(std::clamp(static_cast<int>(std::lround(params_[kParamQuality])), 0, 2),
                      std::memory_order_relaxed);
  lastQuality_ = qualityPlain_.load(std::memory_order_relaxed);

  std::string root, sel;
  if (!readStr(streamer, root) || !readStr(streamer, sel))
    return kResultFalse;

  int32 ch = 0, frames = 0;
  float sr = 44100.f;
  if (!streamer.readInt32(ch) || !streamer.readInt32(frames) || !streamer.readFloat(sr))
    return kResultFalse;
  Dsp::IrBuffer ir;
  if (ch > 0 && frames > 0 && ch <= 4 && frames < 16 * 192000)
  {
    ir.channels = ch;
    ir.frames = frames;
    ir.sampleRate = sr;
    ir.interleaved.resize(static_cast<size_t>(frames) * static_cast<size_t>(ch));
    if (!streamer.readFloatArray(ir.interleaved.data(), frames * ch))
      return kResultFalse;
    ir.name = sel;
  }

  std::vector<std::string> open;
  int scroll = 0;
  if (version >= 2)
  {
    int32 nOpen = 0;
    if (streamer.readInt32(nOpen) && nOpen >= 0 && nOpen <= kMaxOpenDirs)
    {
      bool ok = true;
      for (int32 i = 0; i < nOpen; ++i)
      {
        std::string p;
        if (!readStr(streamer, p))
        {
          ok = false;
          break;
        }
        if (!p.empty() && p.size() <= static_cast<size_t>(kMaxOpenPath))
          open.push_back(std::move(p));
      }
      int32 sc = 0;
      if (ok && streamer.readInt32(sc))
        scroll = std::clamp(static_cast<int>(sc), 0, 1'000'000);
      else
        open.clear();
    }
  }

  bool clearConv = false;
  {
    std::lock_guard<std::mutex> lock(dataMutex_);
    libraryRoot_ = root;
    selectedRel_ = sel;
    openDirs_ = std::move(open);
    treeScroll_ = scroll;
    if (version < 2)
      ensureAncestorsOpenLocked();
    if (ir.frames > 0)
    {
      rawIr_ = std::move(ir);
      haveIr_ = true;
    }
    else
    {
      rawIr_ = {};
      preparedIr_ = {};
      displayIr_ = {};
      haveIr_ = false;
      waveSeq_.fetch_add(1, std::memory_order_release); // odd: write in progress
      waveDbSize_ = 0;
      waveSeq_.fetch_add(1, std::memory_order_release); // even: stable
      origLengthMs_.store(0.f, std::memory_order_relaxed);
      waveDirty_.store(true);
      clearConv = true;
    }
  }
  if (clearConv)
    publishPendingConv(std::make_unique<Dsp::PartitionedStereoConvolver>());
  if (!root.empty())
    queueJob(JobKind::Scan, root);
  if (haveIr_)
    queueJob(JobKind::Rebuild);

  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API ImpulsePlugin::getState(IBStream* state)
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

  std::string root, sel;
  Dsp::IrBuffer ir;
  std::vector<std::string> open;
  int scroll = 0;
  {
    std::lock_guard<std::mutex> lock(dataMutex_);
    root = libraryRoot_;
    sel = selectedRel_;
    ir = rawIr_;
    open = openDirs_;
    scroll = treeScroll_;
  }
  writeStr(streamer, root);
  writeStr(streamer, sel);
  streamer.writeInt32(ir.channels);
  streamer.writeInt32(ir.frames);
  streamer.writeFloat(ir.sampleRate);
  if (ir.frames > 0 && ir.channels > 0)
    streamer.writeFloatArray(ir.interleaved.data(), ir.frames * ir.channels);
  if (static_cast<int>(open.size()) > kMaxOpenDirs)
    open.resize(static_cast<size_t>(kMaxOpenDirs));
  streamer.writeInt32(static_cast<int32>(open.size()));
  for (const auto& p : open)
    writeStr(streamer, p);
  streamer.writeInt32(scroll);
  return kResultOk;
}

} // namespace Impulse
} // namespace calfNXT
