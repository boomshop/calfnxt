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
    'How long the attack window lasts (ms). Shorter = only the initial spike is shaped (click/beater). Longer = more of the front of the note is treated as “attack” — bigger change to the whole hit. Match it to the instrument’s real transient length. Works with Sensitivity: longer windows make the same hit look like a bigger jump.',

  sustain:
    'Level where “attack” hands off to “release” shaping (dB). Higher threshold = the sustain region starts earlier (more of the note is treated as body). Lower = longer attack region. Fine-tune so Attack Boost isn’t chewing into the body you wanted Release Boost to handle.',

  releaseTime:
    'How long the release/body shaping window lasts (ms). Longer = more of the note tail is affected (room, sustain, ring). Shorter = only the early decay. On pads, longer windows matter; on tight drums, shorter often feels cleaner.',

  view:
    'What the result curve shows: Output (shaped vs dry — boost/cut should lift or drop it off the blue fill), Envelope, Attack, or Release follower. Blue fill = delayed dry; light = filtered detector.',

  softClip:
    'Rounds peaks only while Attack Boost is pushing the signal louder — soft ceiling into 0 dBFS, no gain on quieter parts or the body. 0 = off; turn up when boosted hits clip harshly or sound brittle. Does nothing on Attack Cut / unity gain.',

  link:
    'How L/R feed the detector: Max = louder channel wins (classic), Avg = average, Mid = mono mid only. Mid keeps the image stable; Max follows the louder side on wide sources.',

  sensitivity:
    'How big a jump (in dB) the attack must make before Attack Boost/Cut engages. 0 = every little rise gets shaped — busy hats, HF flutter, room noise too. Raise it so only clearer hits (kick, snare, pluck) snap or soften; smaller flanks stay closer to dry. Does not gate by loudness — quiet but sharp attacks still count if the jump is big enough.',

  delta:
    'Listen to wet − dry only (the change the shaper makes). Great for hearing exactly what Attack/Release are doing. Sidechain Listen still solos the detector filter when enabled.',
} as const;
