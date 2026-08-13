/** Hover titles for DeEsser controls (musicians / producers). */

export const deesserInfo = {
  bypass:
    'Turns de-essing off so sibilance is left untouched (In/Out gains still apply). A/B with a bright “sss” or “ch” to hear whether harshness is controlled or the vocal just got duller.',

  threshold:
    'How loud the detected ess band must be before reduction starts. Lower = more sensitive — catches soft lisps but can chew into brightness. Higher = only loud esses are touched — more natural, less risk of lisping. Tune with Listen so the detector is really hearing the problem band.',

  ratio:
    'How strongly essy peaks are reduced once above threshold. Gentle ratios = subtle polish; high ratios = aggressive lisp control that can sound lispy or dull if overdone. Prefer enough ratio with a well-aimed detector over slamming everything.',

  laxity:
    'Overall timing feel (attack and release together). Higher = slower, gentler — less chatter, more natural on sung esses. Lower = snappier reaction — tighter on sharp spikes, but can sound like a lisp or zipper if too fast. Think “how grabby” rather than separate attack/release knobs.',

  split:
    'Crossover for Split mode — processing focuses above this frequency. Set it under the harsh band so lows/mids stay open while highs get controlled. Ignored for the audio split in Wide mode (Wide reduces the whole signal when the detector fires).',

  makeup:
    'Gain after reduction if the de-esser pulls too much level down. Use sparingly — if you need a lot of makeup, the detector or ratio is probably too aggressive.',

  detection:
    'Detector ballistics. Peak = jumps on sharp spikes (bright consonants). RMS = smoother average — less twitchy. Opto = softer, program-like response. Peak is often best for classic de-essing; RMS/Opto when Peak chatters on the vocal.',

  mode:
    'Wide = when an ess is detected, the whole signal is turned down (simple, can dull the whole vocal). Split = only the high band above Split is reduced — usually more natural, keeps body and warmth while taming air/harshness.',

  slope:
    'Steepness of the detection high-pass that feeds the detector. Steeper = tighter focus on high sibilance, less false triggering from midrange. Too steep with a wrong cutoff can miss the real ess band — check with Listen.',

  hpQ:
    'Resonance of the detection high-pass. Higher Q = sharper emphasis near the cutoff for the detector — can help lock onto a narrow harsh spot. Too much Q can make triggering jumpy.',

  peakFreq:
    'Center of the detection peaking filter — aim at the ess / harsh band (often 5–10 kHz, sometimes higher for “air” harshness). Use Listen and sweep until the soloed detector is mostly the problem, not the whole vocal.',

  peakGain:
    'How much that peaking filter boosts (or cuts) in the detector path. More boost = more sensitive at Peak freq — catches quieter esses. Too much and normal brightness also triggers. Cut if the detector is over-focusing.',

  peakQ:
    'Bandwidth of the detection peak. Higher Q = narrower ess targeting (surgical). Lower Q = wider band of highs can trigger — more forgiving, less precise. Match Q to how wide the harshness is in the spectrum.',

  listen:
    'Solos the detection signal so you can tune HP/Peak/Slope to the sibilance by ear. You’re hearing what the detector hears, not the final de-essed mix — when Listen sounds like “just the problem,” the main path usually behaves better.',
} as const;
