export const whammyInfo = {
  bypass:
    'Turns the shifter off so you hear the delayed dry path (In/Out gains still apply). Latency stays reported to the host so timing does not jump. A/B whether the throw is adding drama or just making the part sound thin and grainy.',

  pitch:
    'The pedal. Centre is unison; up raises pitch (chipmunk / dive-up), down drops it (monster / dive-bomb), ±24 semitones = two octaves either way. This is a blind delay-line shift, not a tuner: chords survive, formants ride along with the pitch, and there is no “wrong note” for the detector to grab. Automate this like an expression pedal. Extreme throws get grainier — that is the vintage character, not a bug.',

  snap:
    'Locks Pitch to a musical grid in both the knob and the DSP — what you hear is what the parameter stores. Free = continuous (classic pedal sweep, in-between notes, slow dives). ST = whole semitones (musical steps, easy +5 / −7 / +12). WT = whole tones (two semitones at a time). Switching ST/WT pulls the current value onto that grid so you are not left between ticks. Automation of Pitch while ST/WT is on is quantized the same way; leave Free if you want a recorded sweep to glide.',

  quality:
    'Grain size vs latency — larger window = fewer splices, cleaner sustains, later in the host. Fast ≈ 16 ms (about 8 ms PDC): snappy, a bit grainy, closest to those 90s pedals that felt almost live. Normal doubles that. Smooth is 64 ms grain / ~32 ms PDC — the usual print setting. Studio doubles again (128 ms / ~64 ms): +octave gets much quieter, +two octaves still has some gargle, attacks smear more, and it is not for playing through. Changing Quality can make the host re-compensate latency — do it while stopped if the graph jumps.',

  mix:
    'Dry vs shifted. 100% = classic lead Whammy (only the thrown pitch). Lower = harmony / doubling — original plus interval, like the pedal’s harmony modes. Dry is delayed to the same latency as the shifter so Mix is not a PDC comb at unison; once you leave 0 the wet delay is moving, so 50/50 can still chorus a little — that is the old harmonizer sound. If the blend feels hollow, push Mix toward 100% or stay closer to unison.',

  glide:
    'How fast Pitch catches the knob (or automation). Short (a few ms) = the pedal is under your foot, zipper-free but immediate. Longer = portamento / dive — the interval eases in instead of stepping. Pair with ST/WT when you want audible slides between grid notes. Too long and the throw lags the groove; too short on big jumps can click — if it does, add a few milliseconds.',

  tone:
    'Brightness of the shifted path only (a gentle low-pass). Open = full digital top, fizzy on big throw-ups. Darker tames the metallic grain and aliases that delay-line shifters add when you go up — more “box of the 90s”, less “sample-rate trash”. Dry Mix is untouched, so darkening wet against a bright dry can sit a harmony under a guitar. If the part disappeared, you went too dark; if it hurts, you went too bright on a +octave.',
};
