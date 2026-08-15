/** Hover titles for Equalizer controls (musicians / producers). */

export const equalizerInfo = {
  bypass:
    'Turns all EQ processing off (In/Out gains still apply). A/B to hear whether the curve is clarifying the mix or just making things louder/harsher.',

  type:
    'Filter shape for this band. Peaking = boost/cut a region; shelves = tilt highs or lows; HP/LP = remove below/above a cutoff; band-pass = isolate a band. Type changes what Gain and Slope mean — a “gain” on HP/LP isn’t the same as a bell boost.',

  slope:
    'Steepness of HP/LP bands (12/24/36/48 dB per octave). Gentle slopes = smoother, more natural roll-off; steep slopes = sharper cut outside the passband (more surgical, more phase shift). Listen for loss of weight vs. cleanup of rumble/air.',

  freq:
    'Center frequency (bells/BP) or cutoff (HP/LP/shelves). Sweep while boosting a bit to find the “honk,” mud, or air you want — then cut or boost with intention. Small moves often beat big ones on a full mix.',

  gain:
    'Boost or cut for peaking, shelves, and band-pass. Boost adds presence or weight but can harden or mask; cut clears mud/harshness and often sounds more open. Pure HP/LP don’t use this as tonal gain the same way — Slope/Freq do the work.',

  q:
    'Bandwidth / resonance. Low Q = wide, musical, less obvious. High Q = narrow surgical notch/boost or a more resonant “ringy” filter character. Wide boosts for tone; narrow cuts for problems.',

  active:
    'Enables or bypasses this band only. Flip bands off to hear their contribution without losing the rest of the curve.',

  dyn:
    'Turns Dynamic EQ on for this band. Level in the detector band modulates the effective gain — like compressing or expanding only that frequency region. Great for taming harshness that only appears on loud notes, or lifting presence when the source gets quiet.',

  dynAttack:
    'How fast dynamic gain moves when the detector rises. Fast = catches spikes (can sound grabby). Slow = lets transients through, then settles — often more natural on vocals and acoustic sources.',

  dynRelease:
    'How fast the dynamic effect recovers when the detector falls. Fast = lively, can pump in that band. Slow = smoother, longer “hold” of the dyn gain change. Match it so the band recovers between phrases without chattering.',

  dynThresh:
    'Detector level where dynamics start changing this band’s gain. Lower = more often active (more audible dyn EQ). Higher = only loud events in that band move the gain — subtler control.',

  dynRatio:
    'How strongly dynamics move the band gain above threshold. Higher = more compression/expansion of that boost/cut. Start gentle; deep ratios can sound like a band-limited compressor pumping.',

  listen:
    'Solos this band’s detector into the output so you can tune Dyn (and the band focus) by ear. While listening, the normal EQ audio path is bypassed for that solo — you’re hearing what triggers the dynamics, not the final mix.',

  spectrum:
    'Analyzer fill behind the EQ curve (post-EQ, before Out gain). Off = no FFT cost. Linear = raw dBFS. −3 / −4.5 dB/oct = pink-style tilt pivoted at 1 kHz.',
} as const;
