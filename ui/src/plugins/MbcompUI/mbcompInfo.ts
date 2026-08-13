/** Hover titles for Multiband Compressor controls (musicians / producers). */

export const mbcompInfo = {
  bypass:
    'Turns all band compression off so you hear the dry path (In/Out gains still apply). A/B the whole multiband treatment — glue vs. lifeless or phasey.',

  numBands:
    'How many frequency bands you split into. Fewer = broader, simpler control (less crossover coloration). More = surgical (kick vs. vocal vs. cymbals), but more phase rotation and more to manage. Adding a band splits the top band at a new crossover.',

  slope:
    'Steepness of the Linkwitz-Riley crossovers. Steeper = tighter band separation (less bleed between bands) but more phase rotation — can sound more “processed.” Gentler slopes = smoother joins, bands influence each other more.',

  xover:
    'Crossover frequency between bands. Drag the vertical handles in the chart. Place splits where instruments live (e.g. under kick thump, under vocal body, under harsh air) so each compressor works on a clear job.',

  bandSelect:
    'Selects this band for the detail controls. Click a strip or handle to focus editing without changing the sound by itself.',

  bandActive:
    'Legacy enable flag (unused). Use Bypass to skip compression for a band.',

  bandBypass:
    'Skips compression for this band while keeping it in the sum. Instant A/B for “is this band helping?” without muting that frequency range.',

  bandListen:
    'Solos this band’s output so you hear only what that band is working on. Only one band at a time. Great for setting threshold/attack on kick vs. vocal without the full mix masking it.',

  threshold:
    'Level where this band starts compressing. Lower = more of that frequency range is ridden — denser lows, tamer harshness, etc. Higher = only loud events in the band are touched. Set with Listen so you’re not guessing from the full mix.',

  ratio:
    'How hard levels above threshold are reduced in this band. Gentle ratios = glue; high ratios = strong control (almost band-limited limiting). Over-ratio on lows can suck punch; on highs can dull air.',

  mode:
    'Detector style for this band. Peak = fast spikes (drums in a band). RMS = smoother average leveling. Opto = softer, program-dependent feel. Per-band mode lets lows stay punchy (slower) while highs grab peaks.',

  link:
    'How L/R (or mid) drive gain reduction for this band. Max = louder channel wins (stable image). Avg = blend. Mid = mid detects (sides freer — width, watch mono).',

  attack:
    'How fast this band’s gain reduction engages. Fast on a low band can thin punch; slow preserves kick/beater then settles. Fast on a high band tames harsh spikes; slow lets brightness through. Loop the problem and Listen.',

  release:
    'How fast gain returns in this band. Fast = punchy, can pump that frequency range. Slow = smoother, can leave the band ducked after loud notes. Aim for GR that recovers between hits without chattering.',

  pdr:
    'Program-dependent release for this band. Higher = release adapts more to the material — often less bounce on busy content in that range. Lower = closer to a fixed release.',

  knee:
    'Softens the onset around threshold for this band. Higher = gentler, less obvious grab; lower = clearer “hit into compression.” Soft knee can feel quieter at the same threshold because reduction eases in earlier.',

  makeup:
    'Band gain after compression to restore loudness lost to GR. Match Listen/bypass loudness before judging tone — makeup shouldn’t just make the band “win” by being louder.',

  mix:
    'Dry/wet blend for this band. Lower = more dry punch under a compressed wet band (parallel per band). Useful when full wet on lows or highs feels flat.',

  gr: 'How many dB this band is currently pulling down. Deep constant GR means that range is being continuously squashed — controlled, but less dynamic in that band.',

  bandIn: 'Level of this band after the crossover split (pre-compression). Shows how loud that slice of the spectrum is going into the compressor.',

  bandOut:
    'Level of this band after compression and makeup. Compare to Band In to hear/see how hard the band is being worked.',

  history:
    'Scrolling history (about 10 seconds): full-range level, this band’s level, and its gain reduction. Use it to see whether GR tracks hits cleanly or rides the whole phrase.',
} as const;
