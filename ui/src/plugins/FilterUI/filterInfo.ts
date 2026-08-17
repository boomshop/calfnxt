/** Hover titles for Filter controls (musicians / producers). */

export const filterInfo = {
  bypass:
    'Turns the filter off so you hear dry input (In/Out gains and meters still work). Use this to A/B whether the filter is shaping tone usefully or just thinning / hollowing the track.',

  mono:
    'Process the Left channel only and copy the result to both outs. Roughly halves filter CPU — ideal on mono tracks. Right-channel content is ignored while on.',

  mode:
    'Filter shape. Low-pass = darkens / removes highs (mud control, dulling harshness, synth “closed filter”). High-pass = thins / removes lows (cleanup, rumble, air without boom). Band-pass = mid “wah” / telephone / auto-wah territory. Band-reject (notch) = scoops a band (hum, resonance, harsh spot). Allpass ≈ same loudness curve but twists phase — subtle when soloed; with Mix < 100% it can add comb-like color. Steeper slopes (24 / 48) cut harder and sound more “surgical”; gentler slopes sound smoother and more musical.',

  resonance:
    'Emphasis at the cutoff / center. Low (≈0.7) = smooth Butterworth-ish, natural. Higher = a peak or “sing” at the edge — classic filter scream, auto-wah bite, synth resonance. Very high Q can ring, whistle, or make Mix sound hollow when dry is blended in (the complementary dry path softens then — expect some coloration).',

  frequency:
    'Where the filter sits (Hz). On a low-pass it’s the “open/closed” point; on high-pass the cleanup floor; on band-pass/reject the center. With Envelope on, this is the start of the sweep (quiet detector → here). Drag Target below Freq for a downward sweep (e.g. ducking filter).',

  inertia:
    'How lazily Frequency and Resonance catch up when you move them (or when the envelope jumps). Low = snappy, zipper-free but still quick — good for deliberate tweaks. Higher = portamento / “liquid” filter moves — musical on envelope auto-wah, less twitchy on busy sources. Too high can feel laggy behind the groove.',

  envPower:
    'Turns the envelope follower on: level drives cutoff between Frequency (quiet) and Target (loud). Off = fixed filter (studio EQ-style). On = auto-wah / envelope filter / ducking filter territory — great on guitars, synths, drums when you want movement locked to the playing.',

  mix:
    'Dry vs filtered — always available, Envelope on or off. 100% = full wet (pure filter). Lower = parallel blend — keep body while filtering air or mids. For LP/HP at moderate Resonance, dry is a complementary opposite filter so Mix stays closer to “flat when summed” instead of comb notches; high Resonance or BP/BR/Allpass accept more coloration. If Mix feels phasey or hollow, raise Mix or lower Resonance.',

  softClip:
    'Rounds hot resonant peaks on the filtered (wet) path so high Resonance screams less and sits better in a mix. 0 = clean linear filter. Raise it when LP/HP/BP with high Res gets harsh, whistly, or digital — you keep the “sing” but with softer edges. Soft Clip does not touch the dry Mix path; at Mix 0 it has no effect. Too much can dull transients and add odd harmonics — A/B with the knob at 0.',

  spectrum:
    'Analyzer fill behind the filter curve (post-filter, before Out gain). Off = no FFT cost. Linear = raw dBFS. −3 / −4.5 dB/oct = pink-style tilt pivoted at 1 kHz — same as the Equalizer overlay.',

  target:
    'Where the envelope sends the cutoff when the detector is loud (env = 1). Above Frequency = opens/brightens on hits (classic auto-wah). Below Frequency = closes/darkens on hits (ducking filter). Set the range so quiet notes sit at Freq and accents reach Target — then tune Attack/Release so it follows the groove, not the noise floor.',

  activation:
    'How hard the detector pushes the envelope (dB). Higher = quieter signals already open the filter — more movement, easier auto-wah. Lower = only louder hits move it — tighter, more gated feel. If it barely moves, raise Activation; if it sits wide open and chatters, lower it.',

  attack:
    'How fast the envelope rises with the signal. Fast = snappy wah on the front of the note (plucks, picks). Slow = smoother swell, less “quack,” better on pads and legato. Too fast on busy material can sound jittery; too slow misses the hit.',

  release:
    'How fast the envelope falls after the hit. Fast = filter snaps back (rhythmic, funky). Slow = long filter tails / bloom after the note. Match the song tempo: short release for 16ths, longer for held chords. If it pumps or chatters, lengthen Release or switch detector mode.',

  detection:
    'How loudness is measured into the envelope. Peak = follows spikes (drums, plosives) — lively, can be twitchy. RMS = average energy — smoother, more “musical” on chords and buses. Opto = softer, photocell-like tracking — often the most natural auto-wah on guitars and complex sources.',
} as const;
