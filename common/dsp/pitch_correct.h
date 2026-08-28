#pragma once

// Pitch-correction law: scale snap, octave guard, keep-natural vs added vibrato,
// retune/release, amount/threshold. Source (voice/strings/guitar) sets note-centre
// LP and added-vibrato max width; Cher snap is Retune/Keep on the knobs.

#include "dsp_math.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace calfNXT {
namespace Dsp {

class PitchCorrector
{
public:
  struct Params
  {
    int source = 0; // 0=voice, 1=strings, 2=guitar
    bool vibOn = false;
    float retuneMs = 80.f;
    float releaseMs = 120.f;
    float amount = 1.f;
    float thresholdCents = 10.f;
    float flexCents = 80.f;
    float vibratoPreserve = 0.75f;
    float settle = 0.4f;
    float vibDelayMs = 100.f;
    float vibFadeMs = 200.f;
    float vibHz = 5.f;
    float octaveProtect = 0.8f;
    float refHz = 440.f;
    uint16_t noteMask = 0x0fff; // bits 0=C … 11=B
  };

  struct Output
  {
    float ratio = 1.f;        // outHz / inHz, applied identically to L and R
    float inMidi = 0.f;
    float targetMidi = 0.f;
    float correctionCents = 0.f;
    float confidence = 0.f;
    float tremolo = 1.f;      // amplitude settle (≈1)
    bool voiced = false;
    bool unvoiced = true;
    bool octaveSuspect = false;
    bool locked = false;
    bool reattack = false;    // first voiced hop after a real pause
  };

  void reset()
  {
    out_ = {};
    centerMidi_ = 0.f;
    prevMidi_ = 0.f;
    corrCents_ = 0.f;
    holdSec_ = 0.f;
    settlePhase_ = 0.f;
    delaySec_ = 0.f;
    fade_ = 0.f;
    havePitch_ = false;
    slopeEma_ = 0.f;
    lockTarget_ = 0.f;
    haveLockTarget_ = false;
    stickyTarget_ = 0.f;
    lastF0_ = 0.f;
    unvoicedHops_ = 0;
    haveSticky_ = false;
    wasVoiced_ = false;
  }

  const Output& last() const { return out_; }

  /** Hop-rate update. `hopSec` is the time since the previous call. */
  const Output& update(float f0Hz, float confidence, bool voiced, bool octaveSuspect,
                       float hopSec, const Params& p)
  {
    hopSec = std::max(hopSec, 1.0e-4f);
    const Params& sp = p;

    uint16_t mask = sp.noteMask & 0x0fffu;
    if (mask == 0)
      mask = 0x0fffu;

    // Hold last good F0 across a few missed hops so voiced flicker does not
    // slam the ratio to 1 (clicks). Octave is resolved in the detector — do
    // not replace f0 here or the display can sit an octave off the shifter.
    if (voiced && f0Hz > 1.f)
    {
      if (wasVoiced_ && lastF0_ > 1.f)
      {
        const float jump = f0Hz / lastF0_;
        if (jump > 1.8f || jump < (1.f / 1.8f))
          octaveSuspect = true;
      }
      lastF0_ = f0Hz;
      unvoicedHops_ = 0;
    }
    else
    {
      ++unvoicedHops_;
      if (unvoicedHops_ < 4 && lastF0_ > 1.f)
      {
        voiced = true;
        f0Hz = lastF0_;
      }
    }

    out_.confidence = std::clamp(confidence, 0.f, 1.f);
    out_.octaveSuspect = octaveSuspect;
    out_.voiced = voiced && f0Hz > 1.f;
    out_.unvoiced = !out_.voiced;
    out_.reattack = false;

    const float centerHz = sp.source == 1 ? 1.6f : (sp.source == 2 ? 1.3f : 2.4f);

    if (!out_.voiced)
    {
      const float rel = 1.f - std::exp(-hopSec / std::max(0.005f, sp.releaseMs * 0.001f));
      corrCents_ += (0.f - corrCents_) * rel;
      holdSec_ = 0.f;
      delaySec_ = 0.f;
      fade_ = 0.f;
      settlePhase_ = 0.f;
      haveLockTarget_ = false;
      out_.locked = false;
      const float applied = corrCents_ * std::clamp(sp.amount, 0.f, 1.f);
      out_.ratio = centsToRatio(applied);
      // Softly return to unity so unvoiced (breath / bow noise) is not pitched.
      const float toOne = 1.f - std::exp(-hopSec / std::max(0.008f, sp.releaseMs * 0.001f));
      out_.ratio += (1.f - out_.ratio) * toOne;
      out_.tremolo += (1.f - out_.tremolo) * toOne;
      out_.correctionCents = applied;
      if (lastF0_ > 1.f)
        out_.inMidi = hzToMidi(lastF0_, sp.refHz);
      if (haveSticky_)
        out_.targetMidi = stickyTarget_;
      wasVoiced_ = false;
      return out_;
    }

    // New syllable after a real pause: drop the previous note's centre / sticky
    // target / flex slope. Otherwise the onset looks like a gliss (Flex kills
    // Retune) and the shifter yanks toward the old pitch (clicks).
    if (!wasVoiced_)
    {
      havePitch_ = false;
      haveSticky_ = false;
      haveLockTarget_ = false;
      slopeEma_ = 0.f;
      corrCents_ = 0.f;
      holdSec_ = 0.f;
      lastF0_ = f0Hz;
      out_.reattack = true;
    }
    wasVoiced_ = true;

    const float midi = hzToMidi(f0Hz, sp.refHz);
    out_.inMidi = midi;
    if (!havePitch_)
    {
      centerMidi_ = midi;
      prevMidi_ = midi;
      havePitch_ = true;
    }

    const float lpCoeff = 1.f - std::exp(-hopSec * 2.f * float(M_PI) * centerHz);
    centerMidi_ += (midi - centerMidi_) * std::clamp(lpCoeff, 0.f, 1.f);
    const float deltaMidi = midi - prevMidi_;
    slopeEma_ += (deltaMidi / hopSec - slopeEma_) * 0.25f; // MIDI/sec
    prevMidi_ = midi;

    const float vibKeep = std::clamp(sp.vibratoPreserve, 0.f, 1.f);
    const float track = centerMidi_ + (midi - centerMidi_) * (1.f - vibKeep);
    // Low Vibrato → snap the instant pitch (hard-tune); high → snap the note centre.
    const float snapFrom = centerMidi_ + (midi - centerMidi_) * (1.f - vibKeep);
    float target = nearestAllowed(snapFrom, mask, centerMidi_, sp.octaveProtect);
    // Note hysteresis: stay on the current target until a neighbour is clearly
    // closer, so the pull does not chatter between C and C♯.
    if (haveSticky_)
    {
      const float hyst = 8.f + 32.f * vibKeep; // cents of advantage required
      const float stay = std::fabs(stickyTarget_ - snapFrom) * 100.f;
      const float neu = std::fabs(target - snapFrom) * 100.f;
      if (std::fabs(target - stickyTarget_) > 0.01f && (stay - neu) < hyst)
        target = stickyTarget_;
    }
    stickyTarget_ = target;
    haveSticky_ = true;
    out_.targetMidi = target;

    float errCents = (target - track) * 100.f;
    errCents = std::clamp(errCents, -600.f, 600.f);
    const float absErr = std::fabs(errCents);
    const float dead = std::max(0.f, sp.thresholdCents);
    if (absErr < dead)
      errCents = 0.f;
    else if (dead > 0.f)
      errCents -= std::copysign(dead, errCents);

    // Flex: fast pitch motion (gliss / portato) inside the flex window is expression.
    const float slopeCents = std::fabs(slopeEma_) * 100.f; // cents/sec
    const float flex = std::max(0.f, sp.flexCents);
    if (flex > 1.f && absErr < flex && slopeCents > 80.f)
    {
      const float t = std::clamp((flex - absErr) / flex, 0.f, 1.f);
      errCents *= (1.f - t * 0.85f);
    }

    const float att = 1.f - std::exp(-hopSec / std::max(0.001f, sp.retuneMs * 0.001f));
    corrCents_ += (errCents - corrCents_) * std::clamp(att, 0.f, 1.f);

    const float applied = corrCents_ * std::clamp(sp.amount, 0.f, 1.f);

    // Added vibrato keys off the *target note sitting still*, not a quiet
    // input. A chromatic sweep that Amount has snapped still parks on each
    // step long enough to shake; requiring input slope ≈ 0 (old lock) never
    // fired. Pre-vibrato output must already be near that step so we do not
    // wobble while Retune is still catching a leap.
    const float outMidi = midi + applied * 0.01f;
    const float outErrCt = std::fabs(outMidi - target) * 100.f;
    if (haveLockTarget_ && std::fabs(target - lockTarget_) < 0.02f)
      holdSec_ += hopSec;
    else
    {
      holdSec_ = 0.f;
      lockTarget_ = target;
      haveLockTarget_ = true;
    }
    out_.locked = holdSec_ > 0.08f && outErrCt < 55.f;

    float settleCents = 0.f;
    out_.tremolo = 1.f;
    const bool vibOn = sp.vibOn && sp.settle > 0.001f;
    if (!vibOn || !out_.locked)
    {
      delaySec_ = 0.f;
      fade_ = 0.f;
      settlePhase_ = 0.f;
    }
    else
    {
      delaySec_ += hopSec;
      const float delayT = std::max(0.f, sp.vibDelayMs) * 0.001f;
      if (delaySec_ < delayT)
      {
        fade_ = 0.f;
        settlePhase_ = 0.f;
      }
      else
      {
        const float fadeT = std::max(0.f, sp.vibFadeMs) * 0.001f;
        if (fadeT < 0.001f)
          fade_ = 1.f;
        else
          fade_ = std::min(1.f, fade_ + hopSec / fadeT);
        const float vibHz = std::clamp(sp.vibHz, 2.f, 10.f);
        settlePhase_ += hopSec * vibHz;
        settlePhase_ -= std::floor(settlePhase_);
        const float s = sineTurns(settlePhase_);
        const float depth = sp.settle * fade_;
        // Peak cents at Depth=1: wide enough that the top of the knob is
        // obviously synthetic; mid Depth stays in a sung/played range.
        const float peakCt = sp.source == 1 ? 160.f : (sp.source == 2 ? 130.f : 100.f);
        settleCents = s * peakCt * depth;
        out_.tremolo = 1.f + s * 0.05f * depth;
      }
    }

    out_.correctionCents = applied;
    out_.ratio = centsToRatio(applied + settleCents);
    out_.ratio = std::clamp(out_.ratio, 0.25f, 4.f);
    return out_;
  }

private:
  static float hzToMidi(float hz, float ref)
  {
    hz = std::max(hz, 1.f);
    ref = std::max(ref, 1.f);
    return 69.f + 12.f * std::log2(hz / ref);
  }

  static float centsToRatio(float cents)
  {
    return std::exp2(cents / 1200.f);
  }

  static float nearestAllowed(float midi, uint16_t mask, float prevCenter, float octaveProtect)
  {
    const int midiRound = static_cast<int>(std::lround(midi));
    float best = static_cast<float>(midiRound);
    float bestCost = 1.0e9f;
    // Search ±2 octaves around the estimate.
    for (int n = midiRound - 24; n <= midiRound + 24; ++n)
    {
      const int pc = ((n % 12) + 12) % 12;
      if (((mask >> pc) & 1u) == 0)
        continue;
      const float cand = static_cast<float>(n);
      float cost = std::fabs(cand - midi);
      const float jump = std::fabs(cand - prevCenter);
      if (jump > 6.f)
        cost += jump * (0.35f + 1.4f * std::clamp(octaveProtect, 0.f, 1.f));
      if (cost < bestCost)
      {
        bestCost = cost;
        best = cand;
      }
    }
    return best;
  }

  Output out_{};
  float centerMidi_ = 0.f;
  float prevMidi_ = 0.f;
  float corrCents_ = 0.f;
  float holdSec_ = 0.f;
  float settlePhase_ = 0.f;
  float delaySec_ = 0.f;
  float fade_ = 0.f;
  float slopeEma_ = 0.f;
  float stickyTarget_ = 0.f;
  float lockTarget_ = 0.f;
  float lastF0_ = 0.f;
  int unvoicedHops_ = 0;
  bool havePitch_ = false;
  bool haveLockTarget_ = false;
  bool haveSticky_ = false;
  bool wasVoiced_ = false;
};

} // namespace Dsp
} // namespace calfNXT
