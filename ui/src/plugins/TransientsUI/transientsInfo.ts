/** Hover titles for Transients controls (musicians / producers). */

export const transientsInfo = {
  bypass:
    'Disables processing so you hear the dry input (levels/meters still apply as usual).',
  mix:
    'Blend between dry and shaped signal. 0% = dry only; 100% = full transient processing.',
  attackBoost:
    'Push or pull the attack portion of the envelope. Positive = snappier hits; negative = softer attacks.',
  lookahead:
    'Lets the processor “see” slightly ahead so boost/cut catches the transient cleanly. Higher = more PDC latency reported to the host.',
  releaseBoost:
    'Push or pull the sustain/release body after the hit. Positive = more body/ring; negative = tighter, shorter notes.',
  attackTime:
    'How long the attack window lasts (ms). Shorter = only the initial spike; longer = more of the front of the note.',
  sustain:
    'Level where “attack” hands off to “release” shaping (dB). Higher threshold = earlier sustain region.',
  releaseTime:
    'How long the release/body shaping window lasts (ms). Longer = more of the note tail is affected.',
  view:
    'What the envelope display shows (input / output / envelope overlays).',
  window:
    'Time span of the scrolling envelope display (not an audio parameter).',
} as const;
