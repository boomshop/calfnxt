/** Hover titles for Tuner controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const tunerInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Turns the correction off. You still hear the delayed dry path, so the timing does not jump.',
    meta: [
      { label: 'DAW name', value: 'Bypass' },
      { label: 'Parameter ID', value: '2' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The reported latency stays. The header In and Out gains are unity while it is on. The wet path is ducked the same way an unvoiced sound is, so the return does not click.',
          },
        ],
      },
    ],
  }),

  mono: infoDoc({
    name: 'Mono',
    lead: 'Reads the left channel only and copies the result to both outputs.',
    meta: [
      { label: 'DAW name', value: 'Mono' },
      { label: 'Parameter ID', value: '35' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          { p: 'Right-channel content is ignored. Detect still follows whichever side you chose, but a Mid or Mix detect on a mono feed is just the left.' },
        ],
      },
    ],
  }),

  profile: infoDoc({
    name: 'Source',
    lead: 'Writes a starting set of knobs for voice, strings, or guitar.',
    meta: [
      { label: 'DAW name', value: 'Source' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Stored range', value: '0…2. The buttons send Voice 0, Strings 1, Guitar 2.' },
      { label: 'Default', value: '0 (Voice)' },
    ],
    sections: [
      {
        heading: 'What they set',
        blocks: [
          {
            ul: [
              'Voice: Low 80 Hz, High 700 Hz, Retune 80 ms, Threshold 10 ct, Flex 100 ct, Keep 75 %, Formant 85 %, Unvoiced 58 %, Octave 88 %.',
              'Strings: Low 55 Hz, High 700 Hz, Retune 120 ms, Threshold 14 ct, Flex 150 ct, Keep 90 %, Formant 92 %, Unvoiced 45 %, Octave 85 %.',
              'Guitar: Low 70 Hz, High 1 400 Hz, Retune 80 ms, Threshold 16 ct, Flex 250 ct, Keep 65 %, Formant 90 %, Unvoiced 60 %, Octave 75 %.',
            ],
          },
          {
            p: 'After the click, the knobs are the settings. The same choice also picks a few detector constants that are not on the panel: how the note centre is smoothed, and how wide an added vibrato may get. Click the source again to write those defaults once more. There is no separate hard-tune mode. That is Retune and Keep.',
          },
        ],
      },
    ],
  }),

  quality: infoDoc({
    name: 'Quality',
    lead: 'Sets the length of the pitch window, and with it the latency.',
    meta: [
      { label: 'DAW name', value: 'Quality' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '75 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The analysis window runs from 24 ms at the left to 92 ms at the right. The reported latency is half that window, plus one period of the Low frequency, plus a short margin. Left is quicker and more willing to pick the wrong octave on a low note. Right is steadier and later in the host. Low feeds the same latency.',
          },
        ],
      },
    ],
  }),

  formant: infoDoc({
    name: 'Formant',
    lead: 'Sets how much of the original tone colour is put back after the shift.',
    meta: [
      { label: 'DAW name', value: 'Formant' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '85 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'High keeps the body while the pitch moves. Low lets the colour ride with the pitch, which is the cartoon or hard-tune sound.' },
        ],
      },
    ],
  }),

  retune: infoDoc({
    name: 'Retune',
    lead: 'Sets how fast the pitch is pulled toward the target.',
    meta: [
      { label: 'DAW name', value: 'Retune' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '1 … 400 ms' },
      { label: 'Default', value: '80 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'These are real milliseconds. The pull is a time constant of this length. 1 ms is a snap. 80 ms, the start, is a vocal glide. 400 ms is lazy. Fast irons slides and can chirp on consonants. There is no separate hard-tune switch.',
          },
        ],
      },
    ],
  }),

  release: infoDoc({
    name: 'Release',
    lead: 'Sets how the correction lets go when the sound becomes unvoiced or the note ends.',
    meta: [
      { label: 'DAW name', value: 'Release' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '10 … 2 000 ms' },
      { label: 'Default', value: '120 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'These are real milliseconds. Fast drops the correction as soon as the detector lets go. Slow eases the last pull out, so a tail is not yanked onto a dead grid.',
          },
        ],
      },
    ],
  }),

  amount: infoDoc({
    name: 'Amount',
    lead: 'Sets how much of the computed correction is applied.',
    meta: [
      { label: 'DAW name', value: 'Amount' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '100 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: '100 % goes all the way to the target, within Retune, Threshold, and Flex. Lower stops part of the way there.' },
        ],
      },
    ],
  }),

  threshold: infoDoc({
    name: 'Threshold',
    lead: 'A dead zone, in cents. Error inside it is left alone.',
    meta: [
      { label: 'DAW name', value: 'Threshold' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Range', value: '0 … 50 ct' },
      { label: 'Default', value: '10 ct' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 treats every wobble as a target. A wider window leaves a note that is already close, including a small natural vibrato. Too wide and a note that is actually off never moves.',
          },
        ],
      },
    ],
  }),

  flex: infoDoc({
    name: 'Flex',
    lead: 'Sets how large a bend is treated as expression instead of a mistake.',
    meta: [
      { label: 'DAW name', value: 'Flex' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Range', value: '0 … 400 ct' },
      { label: 'Default', value: '100 ct' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Below this, a fast move is not ironed onto the nearest scale step. 0 makes everything a target. Guitar writes 250 ct. Voice writes 100 ct.',
          },
        ],
      },
    ],
  }),

  keep: infoDoc({
    name: 'Keep',
    lead: 'Sets how much of the player’s own vibrato is left on the note.',
    meta: [
      { label: 'DAW name', value: 'Keep' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '75 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'High corrects the centre and leaves the shake. 0 flattens the instantaneous pitch onto the grid. This does not add wobble. That is the Vibrato block.',
          },
        ],
      },
    ],
  }),

  vibrato: infoDoc({
    name: 'Vibrato',
    lead: 'Adds a vibrato after the corrected pitch has sat on a note.',
    meta: [
      { label: 'DAW name', value: 'Vibrato' },
      { label: 'Parameter ID', value: '31' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'It waits for Delay, then fades in to Depth at Rate. It drops when the target note changes or the sound goes unvoiced. A glide that Flex lets through never parks, so this LFO does not start.',
          },
        ],
      },
    ],
  }),

  depth: infoDoc({
    name: 'Depth',
    lead: 'Sets how wide the added vibrato is, once it has faded in.',
    meta: [
      { label: 'DAW name', value: 'Depth' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '40 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 runs the rate and the delay and you hear nothing. The widest peak depends on the source: voice is the narrowest of the three, then guitar, then strings. The Vibrato switch has to be on.',
          },
        ],
      },
    ],
  }),

  vibDelay: infoDoc({
    name: 'Delay',
    lead: 'Extra wait after the corrected pitch has sat on a note, before the added vibrato starts.',
    meta: [
      { label: 'DAW name', value: 'Delay' },
      { label: 'Parameter ID', value: '32' },
      { label: 'Range', value: '0 … 2 000 ms' },
      { label: 'Default', value: '100 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'These are real milliseconds. 0 starts as soon as the output is parked. A long delay leaves the attack straight and shakes only the tail.' },
        ],
      },
    ],
  }),

  vibFade: infoDoc({
    name: 'Fade',
    lead: 'Sets how long the added vibrato takes to reach full Depth.',
    meta: [
      { label: 'DAW name', value: 'Fade' },
      { label: 'Parameter ID', value: '33' },
      { label: 'Range', value: '0 … 2 000 ms' },
      { label: 'Default', value: '200 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [{ p: 'These are real milliseconds. 0 appears at full width. The start blooms in over 200 ms.' }],
      },
    ],
  }),

  vibRate: infoDoc({
    name: 'Rate',
    lead: 'Sets the speed of the added vibrato.',
    meta: [
      { label: 'DAW name', value: 'Rate' },
      { label: 'Parameter ID', value: '34' },
      { label: 'Range', value: '2 … 10 Hz' },
      { label: 'Default', value: '5 Hz' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [{ p: 'These are real cycles per second. This only clocks the added LFO. Keep is the player’s own shake.' }],
      },
    ],
  }),

  octaveProtect: infoDoc({
    name: 'Octave',
    lead: 'Sets how hard the detector refuses a sudden octave jump.',
    meta: [
      { label: 'DAW name', value: 'Octave' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '88 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'High stays in the current register unless the detector is sure. Low lets the nearest octave win. The suspect dots on the roll are that hunt. Until the fundamental agrees, the shifter passes dry, so a wrong-octave grain does not click.',
          },
        ],
      },
    ],
  }),

  unvoiced: infoDoc({
    name: 'Unvoiced',
    lead: 'Sets how easily breath, bow noise, and pick noise are left unpitched.',
    meta: [
      { label: 'DAW name', value: 'Unvoiced' },
      { label: 'Parameter ID', value: '14' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '58 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Higher leaves more of the noisy part alone. Lower treats more of the take as pitched, which can pull an S or a scrape onto a note. Gaps in the roll are these unvoiced stretches.',
          },
        ],
      },
    ],
  }),

  detect: infoDoc({
    name: 'Detect',
    lead: 'Chooses where the one pitch is heard. Both sides are always shifted by that same ratio.',
    meta: [
      { label: 'DAW name', value: 'Detect' },
      { label: 'Parameter ID', value: '15' },
      { label: 'Stored range', value: '0…3. The buttons send Mid 0, Left 1, Right 2, Mix 3.' },
      { label: 'Default', value: '0 (Mid)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            p: 'Mid is the average of the two sides. Left or Right is that side only. Mix lets the louder side lead. The two channels are never tuned apart.',
          },
        ],
      },
    ],
  }),

  fmin: infoDoc({
    name: 'Low',
    lead: 'The lowest frequency the detector may call a fundamental.',
    meta: [
      { label: 'DAW name', value: 'Low' },
      { label: 'Parameter ID', value: '16' },
      { label: 'Range', value: '25 … 400 Hz' },
      { label: 'Default', value: '80 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Voice writes 80 Hz. Strings writes 55 Hz. Guitar writes 70 Hz. Too high and a low note is heard as the octave above. Too low adds octave hunting, and the latency grows because one period of this frequency is part of it. The floor is 25 Hz.',
          },
        ],
      },
    ],
  }),

  fmax: infoDoc({
    name: 'High',
    lead: 'The highest fundamental the detector will consider.',
    meta: [
      { label: 'DAW name', value: 'High' },
      { label: 'Parameter ID', value: '17' },
      { label: 'Range', value: '200 … 2 000 Hz' },
      { label: 'Default', value: '700 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Voice and Strings write 700 Hz. Guitar writes 1 400 Hz. Too high invites harmonics. Too low clips the top of the part and the shift goes thin. Keep the window as tight as the part allows.',
          },
        ],
      },
    ],
  }),

  ref: infoDoc({
    name: 'A4',
    lead: 'Sets the concert pitch the scale is built on.',
    meta: [
      { label: 'DAW name', value: 'A4' },
      { label: 'Parameter ID', value: '18' },
      { label: 'Range', value: '415 … 466 Hz' },
      { label: 'Default', value: '440 Hz' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Every target moves together. It is not a transpose of the melody. 440 is the start. 442 to 444 is a typical orchestra. 415 is about a semitone down. 466 is about a semitone up.',
          },
        ],
      },
    ],
  }),

  notes: infoDoc({
    name: 'Notes',
    lead: 'The twelve pitch classes the corrector is allowed to aim at.',
    meta: [
      { label: 'DAW names', value: 'C, C#, D, D#, E, F, F#, G, G#, A, A#, B' },
      { label: 'Parameter IDs', value: 'C is 19. Each next note is one higher. B is 30.' },
      { label: 'Stored value', value: '0…1 each. On at 0.5 and above. The keys write 0 or 1.' },
      { label: 'Default', value: 'All on' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The engine sees this mask, not the name of a scale. All off is treated as chromatic, so there is always somewhere to go. Held MIDI notes replace the mask for as long as they are held. Octaves are ignored. Editing a key sets Scale to Custom.',
          },
        ],
      },
    ],
  }),

  scale: infoDoc({
    name: 'Scale',
    lead: 'Writes the twelve note keys from a template. It is not a parameter.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Chromatic, Major, Minor, harmonic minor, Dorian, Mixolydian, the two pentatonics, Blues, and Whole tone. If a Key is lit, the template is rotated to that root. Otherwise it is written from C. Custom means the keys were edited, and choosing it does not rewrite them. Changing the scale clears a held MIDI override. After a reload the menu can show Chromatic while the stored keys are still a saved mask.',
          },
        ],
      },
    ],
  }),

  key: infoDoc({
    name: 'Key',
    lead: 'The root the current scale template is written from. It is not a parameter.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Nothing is highlighted until you pick one. Changing it rewrites the twelve notes from the current template and clears a held MIDI override. Editing any note clears this highlight and sets Scale to Custom.',
          },
        ],
      },
    ],
  }),

  history: infoDoc({
    name: 'Roll',
    lead: 'The last 10 seconds of detected pitch, target, and processed pitch. It is a display.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'In is what was played, including the player’s vibrato. Target is the scale note being aimed at, drawn dashed. Out is the processed pitch, including Retune and the added vibrato. Suspect dots sit on In. Gaps are unvoiced. The strip under the roll is how far the pitch was pulled.',
          },
        ],
      },
    ],
  }),

  traceIn: infoDoc({
    name: 'In',
    lead: 'Shows the detected pitch on the roll.',
    sections: [
      {
        heading: 'What you see',
        blocks: [{ p: 'This is the played pitch, including natural vibrato. The octave-suspect dots ride this trace. The chip is display only.' }],
      },
    ],
  }),

  traceTarg: infoDoc({
    name: 'Target',
    lead: 'Shows the scale note the corrector is aiming at.',
    sections: [
      {
        heading: 'What you see',
        blocks: [{ p: 'It is the grid, not the audio. The chip is display only.' }],
      },
    ],
  }),

  traceOut: infoDoc({
    name: 'Out',
    lead: 'Shows the pitch that leaves the plugin.',
    sections: [
      {
        heading: 'What you see',
        blocks: [{ p: 'Retune and the added vibrato are in this line. The player’s own vibrato stays in In. The chip is display only.' }],
      },
    ],
  }),
} as const;
