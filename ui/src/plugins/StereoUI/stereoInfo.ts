/** Hover titles for Stereo controls (musicians / producers). */

export const stereoInfo = {
  bypass:
    'Disables stereo processing (I/O gains still apply).',
  mode:
    'Channel matrix before the rest of the chain (LR, MS encode/decode, mono folds, L/R swap, etc.). Changes what “In” knobs mean and the bus labels.',
  levelL:
    'Trim for the first input lane (label follows Mode — often L or M).',
  levelR:
    'Trim for the second input lane (label follows Mode — often R or S).',
  mlev:
    'Mid level after the mode matrix. Up = more center; down = thinner middle.',
  mpan:
    'Pans the mid content in the stereo field.',
  slev:
    'Side level. Up = wider/more ambient sides; down = narrower, more mono.',
  sbal:
    'Balances side energy left vs right.',
  decorr:
    'Turns on stereo decorrelation of the sides for a wider, less correlated image (use carefully in mono-critical mixes).',
  decorrAmount:
    'How strong the decorrelator is. Higher = more width/diffusion of the side image.',
  decorrXover:
    'Frequency above which decorrelation is applied more. Keeps low end tighter when set higher.',
  decorrSlope:
    'Steepness of the decorrelator split filter (12/24/48 dB).',
  decorrStages:
    'How many decorrelation stages. More = denser/wider effect, more CPU color.',
  decorrSpread:
    'How differently L vs R are treated in the decorrelator. Higher = more L/R difference.',
  muteL:
    'Mutes the first channel lane after spatial processing.',
  muteR:
    'Mutes the second channel lane after spatial processing.',
  phaseL:
    'Flips polarity of the first channel lane.',
  phaseR:
    'Flips polarity of the second channel lane.',
  delay:
    'Haas-style delay between lanes (ms). Positive delays the second lane; negative the first — creates width or direction.',
  stereoBase:
    'Overall stereo base / width macro (−1…+1). Negative can collapse toward mono; positive widens.',
  stereoPhase:
    'Rotates stereo phase (degrees) for imaging tweaks — subtle width/correlation changes.',
  balanceOut:
    'Final left/right output balance.',
} as const;
