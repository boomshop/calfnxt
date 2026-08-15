/** Hover titles for Stereo controls (musicians / producers). */

export const stereoInfo = {
  bypass:
    'Turns stereo processing off (In/Out gains still apply). A/B width and matrix changes — especially in mono — to catch phase or disappearing sides.',

  mode:
    'Channel matrix before the rest of the chain (LR, MS encode/decode, mono folds, L/R swap, etc.). Changes what the In knobs mean and the bus labels. MS is powerful for mid/side EQ-style level work; mono folds are for checking or creative collapse.',

  levelL:
    'Trim for the first input lane (label follows Mode — often L or M). Balance before spatial processing; in MS this is often the mid/center weight.',

  levelR:
    'Trim for the second input lane (label follows Mode — often R or S). In MS this is often side/width energy.',

  mlev:
    'Mid level after the mode matrix. Up = more center (vocals, kick, bass presence); down = thinner middle, relatively wider sides. Extreme cuts can hollow the mix.',

  mpan:
    'Pans the mid content in the stereo field. Subtle offsets can place a mono center; big moves feel unnatural on full mixes — useful on stems.',

  slev:
    'Side level. Up = wider, more ambient/roomy sides; down = narrower, more mono-safe. Too much side can vanish in mono or get splashy; too little feels glued to the center.',

  sbal:
    'Balances side energy left vs right. Corrects asymmetric rooms or skewed stereo without touching the mid.',

  decorr:
    'Turns on stereo decorrelation of the sides for a wider, less correlated image. Can sound bigger and more “open,” but overdo it and mono compatibility or low-end focus suffers — use carefully on buses and masters.',

  decorrAmount:
    'How strong the decorrelator is. Low = subtle width; high = obvious diffusion of the side image (almost reverb-like width). Back off if the center feels weak or the mix falls apart in mono.',

  decorrXover:
    'Frequency above which decorrelation is applied more. Higher crossover keeps the low end tighter and mono-stable while widening highs/airs. Lower lets more bass into the decorrelator — wider but riskier.',

  decorrSlope:
    'Steepness of the decorrelator split filter (12/24/48 dB). Steeper = cleaner separation between “keep tight” lows and “widen” highs; gentler = smoother transition.',

  decorrStages:
    'How many decorrelation stages. More = denser/wider effect and more coloration/CPU. Start low; add stages only if you need more smear.',

  decorrSpread:
    'How differently L vs R are treated in the decorrelator. Higher = more L/R difference and width; lower = more symmetric. Extreme spread can feel unbalanced.',

  muteL:
    'Mutes the first channel lane after spatial processing. Solo/mute utility for checking what’s in L/M after the matrix.',

  muteR:
    'Mutes the second channel lane after spatial processing. Same idea for R/S.',

  phaseL:
    'Flips polarity of the first channel lane. Fixes phase issues or creates creative cancellation — always check mono after flipping.',

  phaseR:
    'Flips polarity of the second channel lane. Same as Phase L for the other lane.',

  delay:
    'Haas-style delay between lanes (ms). Positive delays the second lane; negative the first — creates width or a sense of direction. Small amounts (1–30 ms) widen; larger amounts become audible echoes. Watch mono (Haas can thin the center).',

  stereoBase:
    'Overall stereo base / width macro (−1…+1). Negative collapses toward mono; positive widens. A quick “how wide is this bus?” control — combine with Side Level and Decor for finer work.',

  stereoPhase:
    'Rotates stereo phase (degrees) for imaging tweaks — subtle width/correlation changes. Can fix or create weirdness; use ears and a correlation meter if you have one.',

  balanceOut:
    'Final left/right output balance after all spatial processing. Trim a skewed master or stem without redoing mid/side work.',

  gonio:
    'Goniometer (vectorscope): each sample is plotted as L vs R. A vertical line is mono (center); a cloud that fans left/right is wider stereo. Circles/ellipses suggest phase rotation; a thin diagonal or inverted blob often means polarity / out-of-phase issues. Use it to judge image width and mono risk at a glance.',

  corr:
    'Stereo correlation (−1…+1). Near +1 = highly mono-compatible (L and R move together). Around 0 = wide / diffuse. Negative values mean out-of-phase content that can cancel in mono — watch the low end especially. A healthy master usually sits positive; brief dips are fine, sustained negatives are a red flag.',
} as const;
