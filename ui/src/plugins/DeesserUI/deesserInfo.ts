/** Hover titles for DeEsser controls (musicians / producers). */

export const deesserInfo = {
  bypass:
    'Disables de-essing so sibilance is left untouched (I/O gains still apply).',
  threshold:
    'How loud the detected “ess” band must be before reduction starts. Lower = more sensitive de-essing.',
  ratio:
    'How strongly essy peaks are reduced once above threshold. Higher = more aggressive lisp control.',
  laxity:
    'Overall timing feel (attack/release together). Higher = slower, gentler; lower = snappier reaction to esses.',
  split:
    'Crossover for Split mode — processing focuses above this frequency. Ignored in Wide mode for the audio path split.',
  makeup:
    'Gain after reduction to restore level if the de-esser pulls too much down.',
  detection:
    'Detector ballistics. Peak = reacts to sharp spikes; RMS = smoother average; Opto = softer, program-like response.',
  mode:
    'Wide = gain reduction on the full signal; Split = only the high band above Split is reduced (often more natural).',
  slope:
    'Steepness of the detection high-pass that feeds the detector. Steeper = tighter focus on high sibilance.',
  hpQ:
    'Resonance of the detection high-pass. Higher Q = sharper emphasis near the cutoff for the detector.',
  peakFreq:
    'Center frequency of the detection peaking filter — aim at the ess / harsh band.',
  peakGain:
    'How much that peaking filter boosts (or cuts) in the detector path. More boost = more sensitive at Peak freq.',
  peakQ:
    'Bandwidth of the detection peak. Higher Q = narrower ess targeting.',
  listen:
    'Solos the detection signal so you can tune HP/Peak to the sibilance by ear.',
} as const;
