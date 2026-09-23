/** Hover titles for Tamer controls (musicians / producers). */

export const tamerInfo = {
  bypass:
    'Turns the tamer off while keeping plugin latency so timing stays aligned with the rest of the chain. Use it to A/B whether harshness, whistle, or ring is really gone — or whether you also lost body and air from the source.',

  depth:
    'How deep a detected resonance may be cut (0…24 dB). Once a tip clears Threshold, reduction eases toward this ceiling with a soft knee — the first bit over Threshold never jumps straight to full Depth. Up to about 12 dB, raising Depth mainly allows a deeper cut; past 12 dB (value ring turns warn) the knee also gets hungrier, so the same excess reaches the ceiling faster and the processor feels more surgical. Stay in the gentler zone for vocals and acoustic sources; push higher for stubborn whistles, feedback-ish rings, or harsh presence that will not sit down. A/B with Diff Listen: you want scratch and ring in the solo, not the body of the singer or instrument.',

  sharpness:
    'How wide each cut is, in octaves (about 1/24…1/2). Narrow (≈1/12–1/24) = surgical needles that keep full Depth at the tip and leave neighbouring tone alone — start here on vocals in 2–5 kHz. Wider = broader DynEQ-style dips that grab a whole presence band at once. Too wide on a voice can thin the whole midrange; too narrow can miss a wandering resonance that moves between notes.',

  threshold:
    'How far a spectral tip must stick out above its neighbours before Depth starts cutting (0…24 dB). Higher = pickier — only clear whistles and rings — and a gentler climb toward Depth. Lower = more eager and steeper, quicker to chew formants and harmonic body. Default around 6 stays conservative for sung vowels. This same margin decides when Harmonics treats one ladder peak as a “boom” that should still be tamed.',

  harmonics:
    'Protects a clean pitched series so Depth does not eat the sung or played tone (0…100%). The detector uses the same tips Depth would cut: clear peaks that stick out vs neighbours. It walks them from low to high; a tip already claimed by a ladder is not used to start another. From a free tip it looks for more tips near 2×, 3×, 4× that frequency (with a small tolerance for vibrato and tuning) — three in a row counts as a real tone/ladder. Those frequencies are soft-kept: more Harmonics = more of the tone stays. If one ladder peak is louder than all the others by more than Threshold, that boom still gets tamed (drawn dimmer on the chart). When two ladders share a peak, the harder tame wins. Leave at 0 for classic resonance-only taming; raise on solo voice, bass, or lead when Depth starts chewing body while the analyzer still shows a clear harmonic ladder.',

  attack:
    'How quickly reduction locks onto a new resonance (milliseconds, per analysis hop). Faster catches brief whistles and feedback spikes; too fast can flutter on consonants, picks, or noisy onsets. Match it so the cut arrives with the problem, not a hop late and not chattering on every syllable.',

  release:
    'How long reduction holds after a peak falls. Short = snappy cleanup that follows moving resonances; can pump or blink on a held vowel if Depth is high. Long = smoother and less obvious, but a cut can linger after the whistle is gone and dull the note. Aim for GR that recovers between phrases without leaving a hole in the tone.',

  fLo:
    'Low edge of the search window (left chart handle) — a high-pass that shapes what the analyzer and detector look at. Depth follows that filter curve: full cut in the passband, fading to none by about −24 dB on the skirt (chart floor). Soft slopes still let some action below the handle; steep slopes cut detection off faster. Raise Low to ignore rumble and chest that you do not want treated; lower it if the problem lives under the current edge. Harmonics can still protect related partials that sit on the skirt when a ladder locks from tips inside the window.',

  fHi:
    'High edge of the search window (right chart handle) — a low-pass complementary to Low. Cap the zone so air, hiss, and cymbals outside the problem range never drive the detector. Soft slopes widen the soft catch zone above the handle; steep slopes keep focus tight around the cutoffs. On vocals, parking High around 4–6 kHz often keeps sibilance and air out while still catching harsh presence.',

  hpSlope:
    'Steepness of the low search filter (6…48 dB/oct). Gentler = softer Depth fade below Low and a wider catch zone. Steeper = harder wall, less work on bins already dead from the filter, tighter focus. This is detection and GR amount only — no wet/dry blend. Start at 12–24 dB unless you need a very soft under-hang or a brick-wall ignore below Low.',

  lpSlope:
    'Steepness of the high search filter (6…48 dB/oct). Same idea as HP Slope on the top end: steeper = tighter detector focus and less reaction to air above High. Gentler = a wider soft skirt. Start at 24–48 dB when you want a clear ceiling above the problem band.',

  quality:
    'Analysis resolution vs latency. Fast = smaller FFT — snappier, coarser in the low mids, less PDC. Normal = balanced default. Studio = largest FFT — finer low-mid detail for narrow resonances, more latency reported to the host. The same FFT feeds the chart and the processing, so what you see is what is being treated.',

  spectrum:
    'Display tilt for the background analyzer only (does not change the sound), pivoted at 1 kHz. Linear = raw dBFS — bright material looks brighter. −3 / −4.5 dB/oct ≈ pink-balanced views so a flat mix reads more horizontal and midrange problems are easier to spot.',

  diffListen:
    'Solo what the tamer removes (dry minus wet, latency-matched). You want scratch, whistle, ring, and harsh grit — not the body of the voice or instrument. If Diff Listen sounds like the singer or the dry track, back off Depth, raise Threshold, narrow Sharpness, or raise Harmonics so the tone ladder is kept.',
} as const;
