/** Hover titles for Multiband Compressor controls (musicians / producers). */

export const mbcompInfo = {
  bypass:
    'Disables all bands so you hear the dry path (I/O gains still apply).',
  numBands:
    'Number of frequency bands. Adding a band splits the top band at a new crossover.',
  slope:
    'Steepness of the Linkwitz-Riley crossovers. Steeper = tighter band separation, more phase rotation.',
  xover:
    'Crossover frequency. Drag the vertical handles in the chart to move a split.',
  bandSelect:
    'Selects this band for the detail controls below. Bypass turns compression off for the band.',
  bandActive:
    'Legacy enable flag (unused). Use Bypass to skip compression for a band.',
  bandBypass:
    'Temporarily skips compression for this band while keeping it in the sum.',
  bandListen:
    'Solos this band’s output so you can hear what it is working on. Only one band at a time.',
  threshold:
    'Level where this band starts compressing. Lower = more of the band is compressed.',
  ratio:
    'How hard levels above threshold are reduced (e.g. 4:1). Higher = stronger squashing.',
  mode:
    'Detector style. Peak = fast spikes; RMS = louder average level; Opto = softer, program-dependent feel.',
  link:
    'How L/R (or mid) drive gain reduction together. Max = louder channel wins; Avg = blend; Mid = mid signal detects.',
  attack:
    'How fast gain reduction engages. Faster = grabs transients; slower = lets attacks through.',
  release:
    'How fast gain returns after the band falls. Faster = punchier pumping; slower = smoother.',
  pdr:
    'Program-dependent release amount. Higher = release adapts more to the material.',
  knee:
    'Softens the onset around threshold. Higher = gentler, less obvious “hit” into compression.',
  makeup:
    'Band gain after compression to restore loudness lost to gain reduction.',
  mix:
    'Dry/wet blend for this band. Lower = more dry punch under the compressed band.',
  gr: 'Gain reduction meter — how many dB this band is currently pulling down.',
  bandIn: 'Band level after the crossover split.',
  bandOut: 'Band level after compression and makeup gain.',
  history:
    'Last 10 seconds: full-range level, this band’s level and its gain reduction.',
} as const;
