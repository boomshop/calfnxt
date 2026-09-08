export const octaverInfo = {
  bypass:
    'Turns the octaver off so you hear the delayed dry path (In/Out gains still apply). Latency stays reported to the host so timing does not jump. A/B whether the layers are fattening the part or muddying it.',

  mono:
    'Process the Left channel only and copy the result to both outs. Roughly halves PSOLA grain work across −1/−2/+1 — ideal on mono bass DI, cello, or a single vocal. Right-channel content is ignored while on; Detect still follows Left when set to Mid/Mix. Balance on each voice still pans the mono result.',

  profile:
    'Starting points for bass, cello, voice, and guitar — writes Low/High, Unvoiced, Octave protect, Quality, and which voices are on with sensible levels. After the click the knobs are the truth. Click again to reset that source’s defaults. Bass is the default home: Dry + Sub.',

  quality:
    'Lookahead / analysis window traded for latency. Left = live-ish (shorter window, more octave mistakes on low notes). Park it right for bass DI, cello, and studio vocals. Far right = smoother grains and safer low F0, with tens of ms PDC.',

  octaveProtect:
    'How hard the detector refuses sudden octave jumps. High = stay in the current register unless confidence really says otherwise (cello C2 vs first harmonic, bass slap harmonics, vocal fry). Low = nearest octave wins — faster, more wrong-octave grains on low notes. Keep this high on bass and cello.',

  unvoiced:
    'How easily breath, bow scratch, pick scrape, and mutes are left unpitched. Higher = more noisy stuff bypasses the shifted layers (safer attacks and tails). Lower = more of the take is treated as pitched. If picks chirp into −1, raise this; if quiet bass notes drop out, lower it.',

  detect:
    'Which channel feeds F0: Mid (default for stereo DI/mic pairs), Left, Right, or energy-weighted Mix. One pitch drives every layer; L and R grains stay locked so the image does not smear.',

  fmin:
    'Lowest fundamental allowed. Bass: ~31 Hz for B0 (5-string), ~40 Hz for E1. Cello toward C2 (~65 Hz). Voice ≈ 70–90 Hz. Too high = low notes heard as the octave above. Too low = more hunting and extra latency (Quality + Low both feed PDC).',

  fmax:
    'Highest fundamental considered. Keep the window as tight as the part allows — bass rarely needs more than a few hundred Hz; cello/voice toward 700 Hz; guitar solos higher. Too wide invites harmonics and whistle into the tracker.',

  glide:
    'How quickly period tracking eases onto a new note. Short = snappy layer response. Longer = smoother handoffs on slides and portamento, less click when F0 wobbles. Pair with Attack on the wet gate.',

  gate:
    'Level floor for treating the input as pitched (and for Sub). Below this the wet layers duck toward silence so pauses do not drone. Raise if room noise keeps Sub alive; lower if quiet notes drop out.',

  attack:
    'Wet fade-in after pitch lock — drives both the sub-layer gate and the PSOLA wet/dry crossfade inside each shifted path. Longer values soften bow/pick re-entry and grain hand-offs; too long feels late. If attacks still crackle with Attack high, raise Unvoiced slightly so noisy onsets stay dry-first.',

  dry:
    'The delayed dry path — same latency as the pitched layers so everything stays phase-aligned. Power off to hear only the octave stack. Balance pans this voice in the stereo out without breaking Mid detection.',

  m1:
    'PSOLA one octave down — your signal rebuilt a twelfth lower, with its own Formant and Tone. Good for cello/voice doubles and guitar fattening. Not the same as Sub: this keeps the original timbre instead of synthesizing a new oscillator.',

  m2:
    'PSOLA two octaves down. Heavier and more artefact-prone than −1; Formant high and Tone darker usually help. Use sparingly under Dry, or as a monster bed. Sub is often cleaner for “just more bottom” on bass.',

  p1:
    'PSOLA one octave up — octave harmony / baritone lift. Formant high keeps the body from chipmunking; Tone a bit brighter keeps it from mudding the dry. Great for cello or vocal stacks; less common on bass.',

  sub:
    'Period-locked oscillator at F0/2 — classic bass-octaver flesh, not a pitch shift. Wave picks the shape; Harmonics soft-saturates for growl; Tone darkens the Sub. Usually sit under Dry rather than alone. Gates with Unvoiced / Gate so pauses stay quiet.',

  listen:
    'Solos this voice into the output (exclusive). Use it to set Formant/Tone/Wave without the stack masking the change, then switch Listen off to hear the mix again.',

  formant:
    'How much of the original spectral envelope is put back after the shift on this PSOLA voice. High = body stays put while pitch moves. Low = formants ride the pitch (cartoon / hard electric). Bass and cello usually want this high on −1/−2.',

  tone:
    'Per-voice brightness. Darker rolls the layer into the bed; brighter brings it forward. −2 often wants darker than −1; +1 a touch brighter; Sub has its own Tone under the oscillator.',

  balance:
    'Constant-power pan for this voice only. Sub often stays centred; Dry / ±octaves can sit slightly apart for width without unlinking the stereo grains.',

  level:
    'How loud this voice is in the mix (−60…+12 dB). Large knobs are the main mix — build Dry + Sub for bass, Dry + −1 for cello/voice, add −2/+1 only when you want the colour.',

  subWave:
    'Sub oscillator shape: Sine (round), Triangle (a bit more edge), Square (hollow growl), Saw (brightest before Tone). Harmonics then soft-saturates on top.',

  subHarm:
    'Soft saturation on the Sub — adds odd harmonics without hard clipping. Low = clean sine-ish bed; higher = pedal growl. Pair with Tone so the grit does not eat the whole low end.',

  history:
    'Scrolling pitch roll (~10 s). Dry = tight dashed foreground when powered; −1 sits between accent and warn; −2 warn; +1 solid foreground; Sub = accent. Traces only draw while voiced. Octave-suspect dots sit on the dry F0 line.',
} as const;
