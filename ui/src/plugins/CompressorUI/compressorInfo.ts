/** Hover titles for Compressor controls (musicians / producers). */

export const compressorInfo = {
  bypass:
    'Disables compression so you hear the dry path (I/O gains still apply).',
  mode:
    'Detector style. Peak = fast spikes; RMS = louder average level; Opto = softer, program-dependent feel.',
  link:
    'How L/R (or mid) drive gain reduction together. Max = louder channel wins; Avg = blend; Mid = mid signal detects.',
  threshold:
    'Level where compression starts. Lower = more of the signal is compressed.',
  ratio:
    'How hard levels above threshold are reduced (e.g. 4:1). Higher = stronger squashing.',
  attack:
    'How fast gain reduction engages. Faster = grabs transients; slower = lets attacks through.',
  release:
    'How fast gain returns after the signal falls. Faster = punchier pumping; slower = smoother.',
  pdr:
    'Program-dependent release amount. Higher = release adapts more to the material (often smoother on complex sources).',
  knee:
    'Softens the onset around threshold. Higher = gentler, less obvious “hit” into compression.',
  makeup:
    'Output gain after compression to restore loudness lost to gain reduction.',
  mix:
    'Dry/wet blend for parallel compression. Lower = more dry punch under the compressed signal.',
  gr:
    'Gain reduction meter — how many dB the compressor is currently pulling down.',
} as const;
