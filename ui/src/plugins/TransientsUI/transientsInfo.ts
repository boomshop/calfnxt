/** Hover titles for Transients controls (musicians / producers). */

export const transientsInfo = {
  bypass:
    'Turns shaping off so you hear the dry input (levels/meters still apply). A/B punch vs. softness — whether attacks got snappier or the body got sucked out.',

  mix:
    'Blend between dry and shaped signal. 0% = dry only; 100% = full transient processing. Parallel-style mixes (e.g. 30–70%) often keep natural tone while adding snap or tightness.',

  attackBoost:
    'Push or pull the attack portion of the envelope. Positive = snappier, more present hits (drums, plucks). Negative = softer attacks — useful when something is too clicky or aggressive. Extreme positive can sound thin or clicky; extreme negative can feel distant.',

  lookahead:
    'Lets the processor “see” slightly ahead so boost/cut catches the transient cleanly instead of late. Higher = more accurate shaping on fast hits, but more latency reported to the host (PDC). If attacks feel smeared or late, try a bit more look.',

  releaseBoost:
    'Push or pull the sustain/release body after the hit. Positive = more body, ring, and room in the note. Negative = tighter, shorter notes — less bloom, more “gated” or dry. Balance with Attack: all attack / no body can sound brittle.',

  attackTime:
    'How long the attack window lasts (ms). Shorter = only the initial spike is shaped (click/beater). Longer = more of the front of the note is treated as “attack” — bigger change to the whole hit. Match it to the instrument’s real transient length.',

  sustain:
    'Level where “attack” hands off to “release” shaping (dB). Higher threshold = the sustain region starts earlier (more of the note is treated as body). Lower = longer attack region. Fine-tune so Attack Boost isn’t chewing into the body you wanted Release Boost to handle.',

  releaseTime:
    'How long the release/body shaping window lasts (ms). Longer = more of the note tail is affected (room, sustain, ring). Shorter = only the early decay. On pads, longer windows matter; on tight drums, shorter often feels cleaner.',

  view:
    'What the envelope display shows (input / output / envelope overlays). Display only — helps you see whether shaping lines up with the hits you hear.',

  window:
    'Time span of the scrolling envelope display (not an audio parameter). Zoom out for phrases; zoom in to align attack/release windows with a single hit.',
} as const;
