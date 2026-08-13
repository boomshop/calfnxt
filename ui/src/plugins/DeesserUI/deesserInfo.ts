/** Hover titles for DeEsser controls (musicians / producers). */

export const deesserInfo = {
  bypass:
    'Turns processing off so sibilance or rumble is left untouched (In/Out gains still apply). A/B to hear whether the problem is controlled or the source just got duller / thinner.',

  target:
    'Ess = classic de-esser: detection high-pass, Split reduces the high band. Rumble = same engine flipped: detection low-pass, Split reduces the low band (bass thumps / rumble). Does not change frequencies or dynamics — retune Split/Peak yourself for the problem band.',

  threshold:
    'How loud the detected problem band must be before reduction starts. Lower = more sensitive. Higher = only loud spikes are touched. Tune with Listen so the detector is really hearing the problem.',

  ratio:
    'How strongly peaks are reduced once above threshold. Gentle ratios = subtle polish; high ratios = aggressive control that can sound unnatural if overdone. Prefer enough ratio with a well-aimed detector over slamming everything.',

  laxity:
    'Overall timing feel (attack and release together). Higher = slower, gentler — less chatter. Lower = snappier reaction — tighter on sharp spikes, but can sound grabby if too fast.',

  split:
    'Crossover for Split mode. Ess: processing focuses above this frequency. Rumble: processing focuses below it. Ignored for the audio split in Wide mode (Wide reduces the whole signal when the detector fires). Full range — set it for your problem, not a fixed “ess” or “rumble” zone.',

  makeup:
    'Gain after reduction if processing pulls too much level down. Use sparingly — if you need a lot of makeup, the detector or ratio is probably too aggressive.',

  detection:
    'Detector ballistics. Peak = jumps on sharp spikes. RMS = smoother average — less twitchy. Opto = softer, program-like response. Peak often works for sharp esses; RMS/Opto when Peak chatters (also useful on slower rumble).',

  mode:
    'Wide = when the detector fires, the whole signal is turned down. Split = only one side of the crossover is reduced (Ess: high band; Rumble: low band) — usually more natural.',

  slope:
    'Steepness of the detection high-pass (Ess) or low-pass (Rumble) that feeds the detector. Steeper = tighter focus on that side of the spectrum, less false triggering from the rest. Check with Listen.',

  hpQ:
    'Resonance of the detection high-pass (Ess) or low-pass (Rumble). Higher Q = sharper emphasis near the cutoff for the detector — can help lock onto a narrow problem spot. Too much Q can make triggering jumpy.',

  peakFreq:
    'Center of the detection peaking filter — aim at the problem band (esses often 5–10 kHz; rumble often low/mid bass). Full range either way. Use Listen and sweep until the soloed detector is mostly the problem.',

  peakGain:
    'How much that peaking filter boosts (or cuts) in the detector path. More boost = more sensitive at Peak freq. Too much and normal content also triggers. Cut if the detector is over-focusing.',

  peakQ:
    'Bandwidth of the detection peak. Higher Q = narrower targeting (surgical). Lower Q = wider band can trigger — more forgiving, less precise.',

  listen:
    'Solos the detection signal so you can tune cutoff/Peak/Slope to the problem by ear. You’re hearing what the detector hears, not the final mix — when Listen sounds like “just the problem,” the main path usually behaves better.',
} as const;
