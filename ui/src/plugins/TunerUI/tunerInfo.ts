/** Hover titles for Tuner controls (musicians / producers). */

export const tunerInfo = {
  bypass:
    'Turns pitch correction off so you hear the delayed dry path (In/Out gains still apply). Latency stays reported to the host so timing does not jump. A/B whether the correction is saving the take or flattening life out of it.',

  profile:
    'Starting points, like Reverb rooms — not a hidden extra law. Voice / Strings / Guitar write range, retune, threshold, flex, Keep, formant, unvoiced, and octave protection, and also pick hidden detector constants (voiced/unvoiced floors, note-centre smoothing, added-vibrato width). After the click, the knobs are the truth. Click again to reset that source’s defaults. Cher snap is Retune / Keep, not a fourth source. Bass lives under Guitar: drop Low to ~31 Hz (B0) for a 5-string; 4-string E can sit near 40 Hz.',

  quality:
    'Lookahead / analysis window / shifter smoothness, traded for latency. Left = live-ish (short window, more octave mistakes on low notes). Right = mix/HiQ (C2-safe F0, smoother grains, tens of ms PDC). Park it right for studio vocals, bowed strings, and guitar; left only if you must monitor through it.',

  formant:
    'How much of the original spectral envelope is put back after the shift. 100% = body/vowels/corpus stay put while pitch moves (no chipmunk). 0% = formants ride the pitch (toy piano, cartoon, hard-tune “electric”). Voice, strings, and guitar usually want this high. Drop it only when the processed “electric” tell is the point.',

  retune:
    'How fast pitch is pulled toward the target, in milliseconds — what you see is what you get (1 ms = instant snap, 80 ms = typical vocal, 400 ms = lazy glide). Fast = audible Cher, consonants can chirp, slides get ironed. Slow = the note eases in, including after a breath or rest: the next syllable should scoop at this speed, not click onto the grid. Voice/Strings/Guitar only write a starting value here; Cher is this knob, not a mode.',

  release:
    'How the correction lets go when the sound becomes unvoiced (breath, S, bow noise, pick scrape, room tail) or the note ends. Fast = correction drops immediately — clean for hard-tune, can click. Slow = the last pull eases out so the tail is not yanked onto a dead grid. Match it so S’s, bow noise, and mutes are not pitched.',

  amount:
    'How much of the computed correction is applied (0–100%). 100% = go all the way to the scale note (within Retune/Threshold/Flex). Lower = only pull part-way — “a bit in tune” without the autotune tell. On a wet string bus, backing off Amount often hides the room-mic lag more than slowing Retune.',

  threshold:
    'Dead zone in cents: error inside this window is left alone. 0 = every wobble is a target. 8–20 ct = in-tune singing or playing (and natural vibrato around the centre) is not constantly grabbed. Too high and genuinely sharp/flat notes never move. Hard-tune wants this low; strings and guitar bends want it higher.',

  flex:
    'How large a bend/gliss (cents) is treated as expression instead of a mistake. Below this, fast pitch motion (scoops, fingerboard slides, guitar bends) is not ironed onto the nearest scale step. 0 = everything is a target (Cher). Strings and guitar want a lot; melisma vocals want some; rap-tune wants little.',

  keep:
    'How much of the singer’s or player’s real vibrato is left alone. 100% = correct the note centre only, keep the 4–7 Hz shake. 0% = flatten instantaneous pitch onto the grid (Cher). If vibrato starts sounding like a trill between two scale notes, raise this or Threshold. This does not add wobble — that is the Vibrato block.',

  vibrato:
    'Adds an artificial vibrato once the target note is held and the corrected pitch is already near it — not when the raw input happens to sit still. A sweep that Amount has stepped onto the scale can shake on each step; a gliss that Flex mostly lets through never parks, so you hear no LFO. Off = none. On = wait for Delay, then Fade in to Depth at Rate. Drops when the target note changes or the sound goes unvoiced.',

  depth:
    'How wide the added vibrato is, once it has faded in. 0 = rate/delay still run but you hear nothing. Around the middle = a sung or bowed sustain. Full = obviously artificial (Voice up to a semitone peak, guitar a little more, strings widest). Pair with Rate: slow+wide is seasick, fast+wide is a trill. The power switch must be on.',

  vibDelay:
    'Extra wait after the corrected pitch has sat on a note (~100 ms), before the added vibrato starts (0–2 s). 0 = shake as soon as the output is parked. 100 ms default = a short held step, then the wobble. Long delay = the attack stays dead-straight, vibrato only on the tail. A continuous gliss (Flex) never parks, so Delay never elapses.',

  vibFade:
    'How long the added vibrato takes to reach full Depth after Delay (0–2 s). 0 = it appears at full width. 200 ms default = it blooms in. Slow fade is the “exhale into the sustain”; fast fade is a switch.',

  vibRate:
    'Speed of the added vibrato in Hz. ~5 Hz is typical sung / bowed / guitar vibrato. Lower = wide, lazy. Higher = nervous or electric. Independent of Keep — this only clocks the synthetic LFO.',

  octaveProtect:
    'How hard the detector refuses sudden octave jumps. High = stay in the current register unless confidence and continuity really say otherwise (cello C2 vs first harmonic, vocal fry, guitar 12th-fret harmonic). Low = nearest MIDI octave wins — faster, more “got the wrong octave” on low notes. Keep this high on a multi-mic string bus or a bass DI.',

  unvoiced:
    'How easily breath, S, bow scratch, pick scrape, and mutes are classified as unvoiced and left unpitched. Higher = more of the noisy stuff bypasses the shifter (safer S’s and tails). Lower = more of the take is treated as pitched — can pull sibilants and scratch onto a note. If S’s chirp, raise this; if quiet hummed notes or ghosted guitar notes are skipped, lower it.',

  detect:
    'Where F0 is heard. Mid = (L+R)/2, the default for a summed vocal or section bus. Left / Right = that channel only (when one mic is cleaner). Mix = energy-weighted blend (the louder mic leads). One pitch, one shift ratio, both channels always — never independent L/R tuning, or the stereo image and phase die.',

  fmin:
    'Lowest frequency the detector is allowed to call a fundamental. Voice ≈ 70–90 Hz. Strings (cello/viola/violin) down toward C2 (~65 Hz, sometimes 55 for open C). Guitar often ~70 Hz. Bass: 4-string E1 ≈ 41 Hz; 5-string B0 ≈ 31 Hz — drop Low to ~31 (floor is 25 Hz). Too high = low notes get heard as the octave above. Too low = more octave hunting and extra latency (Quality + Low both feed PDC). Six-string F♯0 (~23 Hz) sits under the window the detector can resolve.',

  fmax:
    'Highest fundamental considered. Voice often ~800–1000 Hz. Strings rarely need the top. Guitar solos: 24th-fret E6 ≈ 1.3 kHz — the Guitar source writes High ≈ 1.4 kHz; the knob goes to 2 kHz. Soprano C6 is ~1 kHz. Too high lets the detector lock onto harmonics and whistle; too low clips the tessitura (a lead guitar with High at 800 Hz will octave-drop the top of the neck). Keep the window as tight as the part allows.',

  ref:
    'Concert A in Hz (the “zero cents” of the scale). 440 = pop/studio. 442–444 = typical orchestra house pitch. 415 ≈ Baroque (about a semitone down). 432 = the alternate “natural” camp. 466 ≈ high historical Chorton (about a semitone up). This is not a transpose — it slides every target together. If the section is at 442 and you leave 440, everything sits a few cents “corrected” the wrong way.',

  notes:
    'Which pitch classes are legal targets. Scales in this UI only set these twelve bits; the engine never sees “major”, only the mask. Toggle notes for custom sets (e.g. pentatonic, drone + fifths). All off is treated as chromatic so the plugin cannot freeze with nowhere to go.',

  scale:
    'Convenience only: writes the note toggles from a template, rotated by Key. Does not live on the DSP — automation/presets store the twelve notes. After you tweak individual keys, the scale name is just a starting point, not a lock.',

  key:
    'Root used when applying a scale template (C major vs E♭ major, etc.). Changing Key does nothing until you hit a scale — then the bits rotate. Custom note edits stay until you apply a scale again.',

  history:
    'Scrolling piano roll (~10 s), display only — not a Melodyne editor. Blue line = detected pitch (stereo is one linked trace). White dashed line on top = target note. Warn colour = octave suspicion. The strip under the roll is how hard it is pulling: black = none, accent = a semitone, warn = a whole tone, white = two whole tones (theme colours). Gaps in the line are unvoiced (breath / S / bow / pick), left unpitched.',
} as const;
