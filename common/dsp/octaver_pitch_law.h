#pragma once

// Shared Octaver hop pitch law — used by the VST.
// Offline tests must drive OctaverPlugin::process (tools/offline), not a fork of this logic.

#include "yin_detector.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Dsp {

struct OctaverPitchParams
{
  float octaveProtect = 0.9f;
  float gateDb = -48.f;
  float glideCoeff = 0.001f; // 1 - exp(-1 / (glideMs*0.001*sr))
  float fmin = 55.f;
  float fmax = 700.f;
  int yinSource = 1; // strings/cello default; voice=0, guitar/bass=2
};

/** ~160 ms ungated at 8 ms hops — longer than consonants, shorter than seeks/pauses. */
inline constexpr int kOctaverGapForgetHops = 20;

struct OctaverPitchState
{
  float hopPeriodFrom = 200.f;
  float hopPeriodTo = 200.f;
  float lastGoodPeriod = 0.f;
  float anchorF0 = 0.f;
  float lastF0 = 0.f;
  float lastConf = 0.f;
  bool lastOctaveSuspect = false;
  int leapHold = 0;
  /** Counts scrape/bridge hops while YIN flickers; reset on raw accept. */
  int dropoutHold = 0;
  int dryHops = 3;
  float wetGate = 0.f;
  float detectRmsDb = -90.f;
  /** Recent accepted voiced level — pause ghosts sit far below this. */
  float voicedPeakDb = -90.f;

  void reset()
  {
    *this = OctaverPitchState {};
  }

  void forgetPitchMemory()
  {
    hopPeriodFrom = hopPeriodTo = 200.f;
    lastGoodPeriod = 0.f;
    anchorF0 = 0.f;
    lastF0 = 0.f;
    lastConf = 0.f;
    lastOctaveSuspect = false;
    leapHold = 0;
    dropoutHold = 0;
    voicedPeakDb = -90.f;
    // dryHops / wetGate / detectRmsDb kept — caller is still in a gap
  }
};

/** path: 0=off 2=cold 3=leapAccept 4=leapHold 5=glide 6=scrape */
struct OctaverPitchHopResult
{
  float rawF0 = 0.f;
  float f0 = 0.f; // after fundamental/subharmonic helpers
  float period = 200.f;
  float gate = 0.f;
  float prevWetGate = 0.f;
  bool periodHopSnap = false;
  bool hardSnap = false; // true → relockPeriod, false → nudgePeriod (when snap)
  bool applySnap = false;
  bool clearDetectorTrack = false; // plugin should yin.clearTrack()
  int pathCode = 0;
  float confidence = 0.f;
  float flatness = 0.f;
  bool octaveSuspect = false;
};

inline float octaverMidiFromHz(float hz, float ref = 440.f)
{
  if (!(hz > 1.f))
    return 0.f;
  return 69.f + 12.f * std::log2(hz / ref);
}

/**
 * One detector hop. `yin` is used for preferFundamental / preferSubharmonic.
 * Caller supplies the latest YinDetector::Result fields + detect RMS.
 *
 * Two questions that must stay separate (conflating them was the design flaw):
 *
 * A) Is YIN’s raw F0 an octave error *of the current frame*?
 *    → CMND only when confidence is uncertain (< 0.88). Never “because half
 *      is closer to the previous note,” and never against a high-conf lock.
 * B) Is the current note a large leap *from the previous accepted note*?
 *    → leapHold / octaveCaution / leapAccept below. May delay trust; must not
 *      rewrite a high-confidence YIN reading down to match lastF0.
 *
 * Also: weak-confidence creep guard; gap-forget after ~160 ms ungated.
 */
inline OctaverPitchHopResult octaverPitchHop(OctaverPitchState& st, YinDetector& yin,
                                             const OctaverPitchParams& params, float sr,
                                             float detectSr, float rawF0, float confidence,
                                             float flatness, bool voiced, bool periodic,
                                             bool octaveSuspect, float detectRmsDb)
{
  OctaverPitchHopResult out;
  out.rawF0 = rawF0;
  out.confidence = confidence;
  out.flatness = flatness;
  out.prevWetGate = st.wetGate;
  st.detectRmsDb = detectRmsDb;

  const bool reentry = st.dryHops >= 2;
  float f0 = rawF0;
  bool foldedDown = false;

  // --- A) Disambiguate YIN’s own octave (CMND), not vs lastF0 ---
  // High-confidence YIN already chose a period; CMND at 2τ is often *also*
  // good on voiced spectra, so preferSubharmonic would rewrite correct notes
  // down an octave (and then stick via lastF0). Only fold when uncertain.
  // Threshold ~0.88: cello false-high locks often sit at ~0.80–0.85; real
  // stable notes after a leap usually sit ≥0.90.
  //
  // Never fold on a *cold* reentry (forgotten lastF0) — first lock must trust
  // raw YIN. Short dropouts that still remember lastF0 may fold: otherwise
  // 2× raw (e.g. 490 while last≈245) hard-snaps an octave high and paints a
  // red octave-suspect before the next hop corrects.
  // Never fold when raw already agrees with lastF0 — that spike is CMND
  // ambiguity on a stable note, not a 2× false lock (cello mid-note false
  // highs have raw ≈ 2× last, so they still fold).
  const bool coldReentry = reentry && st.lastF0 <= 20.f;
  const bool allowFold = voiced && f0 > 1.f && confidence < 0.88f && !coldReentry;
  if (allowFold)
  {
    const float folded = yin.preferSubharmonicOnAttack(f0, detectSr, params.fmin,
                                                       params.yinSource, 0.12f);
    if (folded > 1.f && folded < f0 * 0.75f)
    {
      const bool rawAgreesWithLast =
        st.lastF0 > 20.f && std::fabs(rawF0 / st.lastF0 - 1.f) < 0.12f;
      // Voice: strong mid-conf upward raw with a CMND fold *below* last can be a
      // real rising interval — but weak conf (e.g. 58.5s 324→490 while true F0
      // ≈245) is almost always the 2× harmonic. Only block the fold when YIN is
      // already fairly sure. Cello never uses this guard (yinSource != 0).
      const bool foldReversesUpLeap =
        params.yinSource == 0 && confidence >= 0.78f && st.lastF0 > 20.f &&
        rawF0 > st.lastF0 * 1.25f && folded < st.lastF0 * 0.92f;
      if (!rawAgreesWithLast && !foldReversesUpLeap)
      {
        f0 = folded;
        foldedDown = true;
      }
    }
  }

  const bool skipDouble =
    foldedDown || (voiced && st.lastF0 > 1.f && f0 > st.lastF0 * 1.40f && confidence < 0.85f);
  if (voiced && f0 > 1.f && !skipDouble)
  {
    const float raised = yin.preferFundamentalOverSubharmonic(f0, detectSr, params.fmax,
                                                              params.yinSource);
    // Reject CMND doubling when raw already tracks lastF0 — otherwise a mid-note
    // harmonic preference plants a false octave-up and leapHold never recovers
    // (period ratio >1.7 has no down-accept timeout).
    const bool rawAgreesWithLast =
      st.lastF0 > 20.f && std::fabs(rawF0 / st.lastF0 - 1.f) < 0.18f;
    if (!(raised > f0 * 1.5f && rawAgreesWithLast))
      f0 = raised;
  }

  // After gap-forget, anchor is 0 so this is a no-op.
  if (reentry && voiced && f0 > 1.f && st.anchorF0 > 1.f && f0 > st.anchorF0 * 1.30f &&
      confidence < 0.88f)
    f0 = st.anchorF0;

  st.lastConf = confidence;
  // Resolved CMND folds / already-locked hops are not hop-to-hop octave errors
  // for the UI marker (YIN still flags when raw flips 2×→1× onto a stable last).
  const bool locksWithLast =
    st.lastF0 > 20.f && f0 > 1.f && std::fabs(f0 / st.lastF0 - 1.f) < 0.12f;
  st.lastOctaveSuspect = octaveSuspect && !foldedDown && !locksWithLast;
  out.octaveSuspect = st.lastOctaveSuspect;
  out.f0 = f0;

  float period = st.hopPeriodTo;
  float gate = 0.f;
  const bool levelOk = detectRmsDb >= params.gateDb;
  // Absolute silence vs recent sung level: YIN often reports high confidence on
  // room tone / headphone bleed an octave off during pauses.
  const bool belowVoicedPeak =
    st.voicedPeakDb > -75.f && detectRmsDb < st.voicedPeakDb - 22.f;
  const bool floorCollapse =
    f0 > 1.f && f0 <= params.fmin * 1.08f && confidence < 0.90f &&
    (st.lastF0 > params.fmin * 1.4f || st.lastF0 <= 20.f);
  const bool rawVoiced = levelOk && periodic && confidence >= 0.28f && flatness < 0.42f &&
                         !floorCollapse && !belowVoicedPeak;
  bool periodHopSnap = false;
  bool hardSnap = false;
  bool applySnap = false;
  int pathCode = 0;

  auto applyPeriod = [&](float p, bool hard) {
    period = std::max(16.f, p);
    st.lastGoodPeriod = period;
    periodHopSnap = true;
    applySnap = true;
    hardSnap = hard;
  };

  bool octaveCaution = false;
  if (rawVoiced && st.lastF0 > 1.f && f0 > 1.f && params.octaveProtect > 0.05f)
  {
    const float rel = f0 / st.lastF0;
    const bool upOct = rel > 1.7f;
    const bool downOct = rel < (1.f / 1.7f);
    float confNeed = 0.55f + 0.35f * params.octaveProtect;
    if (upOct)
      confNeed = 0.55f + 0.18f * params.octaveProtect;
    if ((upOct || downOct) && confidence < confNeed)
      octaveCaution = true;
    if (downOct && (octaveSuspect || confidence < 0.88f))
      octaveCaution = true;
  }

  // Do not weak-hold after a CMND fold: that freezes the *pre-fold* period
  // (e.g. 324 Hz) while f0 is already correct (~245), then snaps lastF0 when
  // confidence ticks past 0.65 — audible Absatz + history jump.
  bool weakLeapHold = false;
  if (rawVoiced && f0 > 1.f && st.lastF0 > 20.f && !reentry && !foldedDown &&
      confidence < 0.65f)
  {
    const float freqRel = f0 / st.lastF0;
    if (freqRel > 1.12f || freqRel < (1.f / 1.12f))
      weakLeapHold = true;
  }

  if (rawVoiced && f0 > 1.f)
  {
    const float pNew = sr / f0;
    const bool coldStart = st.lastGoodPeriod <= 16.f || st.lastF0 <= 20.f;
    bool accepted = false;
    if (weakLeapHold)
    {
      period = st.lastGoodPeriod > 16.f ? st.lastGoodPeriod : st.hopPeriodTo;
      gate = 1.f;
      st.dryHops = 0;
      st.dropoutHold = 0;
      pathCode = 4;
    }
    else if (reentry || coldStart)
    {
      // After a gap, ignore weak locks (breath / room tone / fmin clamp).
      if (confidence < 0.78f || floorCollapse)
      {
        period = st.lastGoodPeriod > 16.f ? st.lastGoodPeriod : st.hopPeriodTo;
        gate = 0.f;
        ++st.dryHops;
        pathCode = 0;
        if (st.dryHops >= kOctaverGapForgetHops)
        {
          st.forgetPitchMemory();
          period = st.hopPeriodTo;
          out.clearDetectorTrack = true;
        }
      }
      else
      {
        // Short dropout with remembered F0: nudge, don't hard-relock / bootstrap.
        const bool softReentry = !coldStart && st.dryHops < 12;
        applyPeriod(pNew, !softReentry);
        st.leapHold = 0;
        st.dropoutHold = 0;
        gate = 1.f;
        accepted = true;
        pathCode = softReentry ? 3 : 2;
      }
    }
    else
    {
      const float rel = pNew / std::max(16.f, st.hopPeriodTo);
      const float freqRel = f0 / std::max(1.f, st.lastF0);
      // Voice: 1.4–1.7× climbs with mid conf are often 2× locks of a lower note
      // (period ratio never trips the 1.7 octave branch — e.g. 324→490). Hold.
      const bool softUpHold = params.yinSource == 0 && !foldedDown && freqRel > 1.40f &&
                              freqRel <= 1.7f && confidence < 0.80f;
      if (softUpHold)
      {
        period = st.lastGoodPeriod > 16.f ? st.lastGoodPeriod : st.hopPeriodTo;
        ++st.leapHold;
        gate = 1.f;
        pathCode = 4;
        const bool rawMatchesF0 = rawF0 > 20.f && std::fabs(rawF0 / f0 - 1.f) < 0.12f;
        if (st.leapHold >= 5 && rawMatchesF0 && confidence >= 0.85f)
        {
          applyPeriod(pNew, false);
          st.leapHold = 0;
          accepted = true;
          pathCode = 3;
        }
      }
      else if (rel > 1.7f || rel < (1.f / 1.7f))
      {
        // Symmetric octave leap accept (up *or* down) when confidence is high
        // and the candidate is not a CMND fold.
        const bool leapUp = !octaveCaution && freqRel > 1.7f && confidence >= 0.85f;
        const bool leapDown = !octaveCaution && freqRel < (1.f / 1.7f) && confidence >= 0.85f &&
                              !foldedDown;
        if (leapUp || leapDown)
        {
          applyPeriod(pNew, false);
          st.leapHold = 0;
          gate = 1.f;
          accepted = true;
          pathCode = 3;
        }
        else if (octaveCaution || rel > 1.7f || rel < (1.f / 1.7f))
        {
          period = st.lastGoodPeriod > 16.f ? st.lastGoodPeriod : st.hopPeriodTo;
          ++st.leapHold;
          gate = 1.f;
          pathCode = 4;
          // Timeout either direction once YIN raw agrees with f0 (not a fold).
          // Mid-conf (0.65–0.80) used to never recover — lastF0 stayed an octave
          // high for hundreds of ms while raw already tracked the true note
          // (vocals: ~0.5 s optical+acoustic “octave up” spikes).
          const bool rawMatchesF0 = rawF0 > 20.f && std::fabs(rawF0 / f0 - 1.f) < 0.12f;
          const bool leapTimeout =
            !foldedDown && rawMatchesF0 &&
            ((st.leapHold >= 3 && confidence >= 0.65f) ||
             (st.leapHold >= 8 && confidence >= 0.45f));
          if (leapTimeout)
          {
            applyPeriod(pNew, false);
            st.leapHold = 0;
            accepted = true;
            pathCode = 3;
          }
        }
        else
        {
          st.leapHold = 0;
          gate = 1.f;
          period = st.hopPeriodTo + (pNew - st.hopPeriodTo) * (0.25f + 0.5f * params.glideCoeff);
          st.lastGoodPeriod = period;
          accepted = true;
          pathCode = 5;
        }
      }
      else
      {
        st.leapHold = 0;
        gate = 1.f;
        period = st.hopPeriodTo + (pNew - st.hopPeriodTo) * (0.25f + 0.5f * params.glideCoeff);
        st.lastGoodPeriod = period;
        accepted = true;
        pathCode = 5;
      }
    }
    if (!weakLeapHold && gate > 0.5f)
      st.dryHops = 0;
    if (accepted)
    {
      st.lastF0 = f0;
      st.dropoutHold = 0;
      if (confidence > 0.78f)
        st.anchorF0 += (f0 - st.anchorF0) * 0.10f;
      else if (st.anchorF0 < 1.f && f0 > 1.f)
        st.anchorF0 = f0;
      if (detectRmsDb > st.voicedPeakDb)
        st.voicedPeakDb = detectRmsDb;
      else
        st.voicedPeakDb += (detectRmsDb - st.voicedPeakDb) * 0.08f;
    }
  }
  else if (levelOk && st.lastF0 > 20.f && st.lastGoodPeriod > 16.f && !floorCollapse &&
           !belowVoicedPeak &&
           ((st.dryHops < 5 && voiced && confidence >= 0.35f) ||
            (st.dropoutHold < 14 && detectRmsDb > st.voicedPeakDb - 16.f)))
  {
    // Scrape / brief YIN dropout: keep period+gate so the wet path does not
    // mute then hard-snap (Absatz + red octave marker on reentry).
    period = st.lastGoodPeriod;
    gate = 1.f;
    st.dryHops = 0;
    ++st.dropoutHold;
    pathCode = 6;
  }
  else
  {
    st.leapHold = 0;
    st.dropoutHold = 0;
    ++st.dryHops;
    gate = 0.f;
    if (!rawVoiced)
      st.lastF0 *= 0.995f;
    // Decay the peak so a quieter later phrase can still open the gate.
    st.voicedPeakDb = std::max(-90.f, st.voicedPeakDb - 0.12f);
    pathCode = 0;

    if (st.dryHops >= kOctaverGapForgetHops)
    {
      st.forgetPitchMemory();
      // Local period still held the pre-forget value — sync it or the end of
      // this function would overwrite hopPeriodTo again.
      period = st.hopPeriodTo;
      out.clearDetectorTrack = true;
    }
  }

  if (periodHopSnap)
  {
    const float p = std::max(16.f, period);
    st.hopPeriodFrom = st.hopPeriodTo = p;
  }
  else
  {
    st.hopPeriodFrom = st.hopPeriodTo;
    st.hopPeriodTo = std::max(16.f, period);
  }
  st.wetGate = gate;

  out.period = period;
  out.gate = gate;
  out.periodHopSnap = periodHopSnap;
  out.hardSnap = hardSnap;
  out.applySnap = applySnap;
  out.pathCode = pathCode;
  out.f0 = f0;
  // Don't advertise pitch confidence to the UI while ungated — silence/noise
  // often spikes YIN confidence without a usable F0 (vocals ~14 s pause).
  if (gate < 0.5f || floorCollapse)
  {
    out.confidence = 0.f;
    st.lastConf = 0.f;
  }
  return out;
}

inline float octaverPsolaPeriod(const OctaverPitchState& st, float hopT)
{
  float period = st.hopPeriodFrom + (st.hopPeriodTo - st.hopPeriodFrom) * hopT;
  if (st.wetGate > 0.5f && st.lastGoodPeriod > 16.f)
    period = st.lastGoodPeriod;
  return period;
}

} // namespace Dsp
} // namespace calfNXT
