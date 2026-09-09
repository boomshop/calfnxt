#pragma once

// Held MIDI notes without sustain latching. Shared by Tuner (pitch-class mask)
// and Filter (absolute note → Hz). Ignores CC / sustain; NoteOn velocity 0 =
// NoteOff. UI can request an all-notes-off via requestClear() / handleAllOffCommand.

#include "pluginterfaces/vst/ivstevents.h"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstring>

namespace calfNXT {
namespace Dsp {

class MidiNoteHold
{
public:
  void clear()
  {
    std::memset(count_, 0, sizeof(count_));
    stackSize_ = 0;
    publish();
  }

  /** UI / scale / knob: drop holds; next process() clears counts. */
  void requestClear()
  {
    clearRequest_.store(true, std::memory_order_relaxed);
    // Optimistic viz so the UI can drop override state without waiting a block.
    mask_.store(0, std::memory_order_relaxed);
    active_.store(false, std::memory_order_relaxed);
    lastPitch_.store(-1, std::memory_order_relaxed);
  }

  /** Call once at the start of process() before ingest(). */
  void consumeClearRequest()
  {
    if (clearRequest_.exchange(false, std::memory_order_relaxed))
      clear();
  }

  /** `{t:"midi",cmd:"alloff"}` — returns true if recognized. */
  bool handleAllOffCommand(const char* json)
  {
    if (!json || std::strstr(json, "alloff") == nullptr)
      return false;
    requestClear();
    return true;
  }

  void ingest(Steinberg::Vst::IEventList* events)
  {
    if (!events)
      return;
    using Steinberg::Vst::Event;
    const Steinberg::int32 n = events->getEventCount();
    for (Steinberg::int32 i = 0; i < n; ++i)
    {
      Event e {};
      if (events->getEvent(i, e) != Steinberg::kResultOk)
        continue;
      if (e.type == Event::kNoteOnEvent)
      {
        if (e.noteOn.velocity <= 0.f)
          noteOff(e.noteOn.pitch);
        else
          noteOn(e.noteOn.pitch);
      }
      else if (e.type == Event::kNoteOffEvent)
      {
        noteOff(e.noteOff.pitch);
      }
    }
  }

  bool active() const { return active_.load(std::memory_order_relaxed); }

  /** Bit0=C … bit11=B from all held pitches (any octave). */
  uint16_t pitchClassMask() const
  {
    return mask_.load(std::memory_order_relaxed);
  }

  /** Most recently pressed pitch that is still held, or −1. */
  int lastPitch() const { return lastPitch_.load(std::memory_order_relaxed); }

  /** Tuner viz: `[active, maskBits]`. Returns 2, or 0 if buffer too small. */
  int fillMaskViz(float* out, int maxOut) const
  {
    if (!out || maxOut < 2)
      return 0;
    out[0] = active() ? 1.f : 0.f;
    out[1] = static_cast<float>(pitchClassMask());
    return 2;
  }

  static float midiNoteToHz(int note, float refHz = 440.f)
  {
    note = std::max(0, std::min(127, note));
    refHz = std::max(1.f, refHz);
    return refHz * std::exp2((static_cast<float>(note) - 69.f) / 12.f);
  }

private:
  void noteOn(int pitch)
  {
    if (pitch < 0 || pitch > 127)
      return;
    if (count_[pitch] < 255)
      ++count_[pitch];
    if (stackSize_ < 128)
      stack_[stackSize_++] = pitch;
    publish();
  }

  void noteOff(int pitch)
  {
    if (pitch < 0 || pitch > 127)
      return;
    if (count_[pitch] > 0)
      --count_[pitch];
    for (int i = stackSize_ - 1; i >= 0; --i)
    {
      if (stack_[i] != pitch)
        continue;
      for (int j = i; j < stackSize_ - 1; ++j)
        stack_[j] = stack_[j + 1];
      --stackSize_;
      break;
    }
    publish();
  }

  void publish()
  {
    uint16_t mask = 0;
    for (int n = 0; n < 128; ++n)
    {
      if (count_[n] > 0)
        mask |= static_cast<uint16_t>(1u << (n % 12));
    }
    mask_.store(mask, std::memory_order_relaxed);
    active_.store(mask != 0, std::memory_order_relaxed);
    lastPitch_.store(stackSize_ > 0 ? stack_[stackSize_ - 1] : -1, std::memory_order_relaxed);
  }

  uint8_t count_[128] {};
  int stack_[128] {};
  int stackSize_ = 0;
  std::atomic<bool> active_ {false};
  std::atomic<uint16_t> mask_ {0};
  std::atomic<int> lastPitch_ {-1};
  std::atomic<bool> clearRequest_ {false};
};

} // namespace Dsp
} // namespace calfNXT
