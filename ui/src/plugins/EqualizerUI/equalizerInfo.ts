/** Hover titles for Equalizer controls (musicians / producers). */

export const equalizerInfo = {
  bypass:
    'Disables EQ processing (I/O gains still apply).',
  type:
    'Filter shape for this band (peaking, shelves, HP/LP, band-pass, …). Changes what Gain/Slope do.',
  slope:
    'Steepness of HP/LP bands (12/24/36/48 dB per octave). Steeper = sharper cut outside the passband.',
  freq:
    'Center or cutoff frequency of the selected band.',
  gain:
    'Boost or cut at this band (peaking/shelves/BP). Not used as tonal gain on pure HP/LP.',
  q:
    'Bandwidth / resonance. Higher Q = narrower peak or more resonant filter character.',
  active:
    'Enables or bypasses this band only.',
  dyn:
    'Turns Dynamic EQ on for this band. Level in the detector band modulates effective gain (compress/expand the boost/cut).',
  dynAttack:
    'How fast dynamic gain reduction/expansion engages on this band.',
  dynRelease:
    'How fast the dynamic effect recovers after the detector falls.',
  dynThresh:
    'Detector level where dynamics start affecting this band’s gain.',
  dynRatio:
    'How strongly dynamics move the band gain above threshold.',
  listen:
    'Solos this band’s detector into the output so you can tune Dyn by ear (EQ audio path bypassed while listening).',
} as const;
