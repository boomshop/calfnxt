export const tamerInfo = {
  bypass:
    'Bypasses the spectral tamer while keeping plugin latency so timing stays aligned with the rest of the chain. Flip it to A/B how much presence or harshness the processor was taking.',

  depth:
    'Maximum cut on a detected resonance (0…24 dB). Once a bin clears Threshold, gain reduction eases toward this ceiling with a soft knee — the first dB over Threshold never jumps straight to full Depth. Up to 12 dB the climb stays “identity” aggressive: more Depth mostly means a higher allowed cut, not a steeper grab. Above 12 dB (value ring turns warn) Depth also drives the knee: the same excess reaches the ceiling faster, so the processor feels hungrier and more surgical. Use that zone for stubborn whistles or harsh presence; stay ≤12 for natural vocal cleanup. A/B with Diff Listen — if you hear the singer’s body, back off Depth or raise Threshold.',

  sharpness:
    'Width of each cut in octaves (1/24…1/2). Narrow (≈1/12–1/24) = surgical needles that keep full Depth at the tip; wider = DynEQ-like beuls. On vocals in 2–5 kHz, start narrow so you don’t take the whole presence band.',

  threshold:
    'How far a bin must stick out above neighbouring partials before cutting starts (0…24 dB). Higher = pickier *and* a gentler rise toward Depth (soft knee tracks this knob). Lower = eager and steeper. Default 6 stays conservative for vowels.',

  attack:
    'How quickly gain reduction locks onto a new resonance (milliseconds, per STFT hop). Faster catches brief whistles; too fast can flutter on consonants.',

  release:
    'How long reduction holds after a peak falls. Short = snappy cleanup; long = smoother, less pumping, but can dull a held vowel if depth is high.',

  fLo:
    'Low edge of the detection filter — a high-pass that shapes what the STFT looks at (also the left block handle). Depth follows the filter curve: full at 0 dB on the skirt, down to none at −24 dB (chart floor). The FFT search window stops there too.',

  fHi:
    'High edge of the detection filter — a low-pass complementary to Low (right block handle). Cap the zone so air and hiss outside the problem range never enter the detector. Soft slopes widen the −24 dB catch zone; steep slopes keep it tight around the cutoffs.',

  hpSlope:
    'High-pass steepness for the search filter (6…48 dB/oct). Gentler slopes still allow a soft Depth fade below the cutoff; steeper walls cut Depth off faster and shrink the FFT window. No wet/dry here — this only feeds detection and GR amount.',

  lpSlope:
    'Low-pass steepness for the search filter (6…48 dB/oct). Same idea as HP Slope on the top end: steeper = tighter detector focus and less work on bins already dead from the filter. Start at 24 dB unless you need a wider soft catch zone.',

  quality:
    'FFT size / latency trade-off. Fast = 1024 (snappier, coarser). Normal = 2048 (default). Studio = 4096 (finer low-mid resolution, more PDC). Same FFT feeds the analyzer and the processor.',

  spectrum:
    'Display tilt for the background analyzer, pivoted at 1 kHz. Linear = raw dBFS. −3 / −4.5 dB/oct ≈ pink-balanced views so a flat mix reads more horizontal.',

  diffListen:
    'Solo what the tamer removes (dry minus wet, latency-matched). You want scratch, whistle, and ring — not the body of the voice. If Diff Listen sounds like the singer, back off Depth or raise Threshold / narrow Sharpness.',
} as const;
