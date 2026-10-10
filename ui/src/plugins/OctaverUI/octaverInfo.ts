/** Hover titles for Octaver controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const octaverInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Turns the layers off. You still hear the delayed dry path, so the timing does not jump.',
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
          { p: 'The reported latency stays. The header In and Out gains are unity while it is on.' },
        ],
      },
    ],
  }),

  mono: infoDoc({
    name: 'Mono',
    lead: 'Reads the left channel only and copies the result to both outputs.',
    meta: [
      { label: 'DAW name', value: 'Mono' },
      { label: 'Parameter ID', value: '42' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          { p: 'Right-channel content is ignored. Balance still pans that mono result. Detect on Mid or Mix is just the left.' },
        ],
      },
    ],
  }),

  profile: infoDoc({
    name: 'Source',
    lead: 'Writes a starting set for bass, cello, voice, or guitar.',
    meta: [
      { label: 'DAW name', value: 'Source' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Stored range', value: '0…3. The buttons send Bass 0, Cello 1, Voice 2, Guitar 3.' },
      { label: 'Default', value: '0 (Bass)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'It writes Low, High, Unvoiced, Octave, Quality, and which voices are on with their levels. After the click, the knobs are the settings. Click the same source again to write them once more. Bass is the start: Dry and Sub.',
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
            p: 'Left is a shorter window and more willing to pick the wrong octave on a low note. Right is steadier and later in the host. Low feeds the same latency.',
          },
        ],
      },
    ],
  }),

  octaveProtect: infoDoc({
    name: 'Octave',
    lead: 'Sets how hard the detector refuses a sudden octave jump.',
    meta: [
      { label: 'DAW name', value: 'Octave' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '90 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'High stays in the current register unless the detector is sure. Low lets the nearest octave win, which is faster and more often wrong on a low note.' },
        ],
      },
    ],
  }),

  unvoiced: infoDoc({
    name: 'Unvoiced',
    lead: 'Sets how easily breath, bow noise, and pick noise are left unpitched.',
    meta: [
      { label: 'DAW name', value: 'Unvoiced' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '55 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'Higher leaves more of the noisy part out of the shifted layers and out of Sub. Lower treats more of the take as pitched.' },
        ],
      },
    ],
  }),

  detect: infoDoc({
    name: 'Detect',
    lead: 'Chooses where the one pitch is heard. Every layer uses that pitch.',
    meta: [
      { label: 'DAW name', value: 'Detect' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Stored range', value: '0…3. The buttons send Mid 0, Left 1, Right 2, Mix 3.' },
      { label: 'Default', value: '0 (Mid)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          { p: 'Mid is the average. Left or Right is that side. Mix lets the louder side lead. The layers stay locked to each other.' },
        ],
      },
    ],
  }),

  fmin: infoDoc({
    name: 'Low',
    lead: 'The lowest frequency the detector may call a fundamental.',
    meta: [
      { label: 'DAW name', value: 'Low' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Range', value: '25 … 400 Hz' },
      { label: 'Default', value: '31 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          { p: '31 Hz is B0, the start, for a five-string bass. Too high and a low note is heard as the octave above. Too low adds hunting, and the latency grows with one period of this frequency.' },
        ],
      },
    ],
  }),

  fmax: infoDoc({
    name: 'High',
    lead: 'The highest fundamental the detector will consider.',
    meta: [
      { label: 'DAW name', value: 'High' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Range', value: '200 … 2 000 Hz' },
      { label: 'Default', value: '400 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [{ p: 'Keep the window as tight as the part allows. Too wide invites harmonics into the tracker.' }],
      },
    ],
  }),

  glide: infoDoc({
    name: 'Glide',
    lead: 'Sets how quickly the tracked period eases onto a new note.',
    meta: [
      { label: 'DAW name', value: 'Glide' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Range', value: '1 … 400 ms' },
      { label: 'Default', value: '40 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [{ p: 'These are real milliseconds. Short follows the hand. Longer smooths slides and wobble in the fundamental.' }],
      },
    ],
  }),

  gate: infoDoc({
    name: 'Gate',
    lead: 'A level floor. Below it the wet layers and Sub duck toward silence.',
    meta: [
      { label: 'DAW name', value: 'Gate' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Range', value: '−60 … 0 dB' },
      { label: 'Default', value: '−48 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [{ p: 'Raise it if room noise keeps Sub alive. Lower it if quiet notes drop out.' }],
      },
    ],
  }),

  attack: infoDoc({
    name: 'Attack',
    lead: 'Sets how long the wet layers take to fade in after the pitch locks.',
    meta: [
      { label: 'DAW name', value: 'Attack' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Range', value: '0 … 80 ms' },
      { label: 'Default', value: '8 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'These are real milliseconds. It drives the Sub gate and the crossfade inside each shifted path. Longer softens a pick or a bow coming back in. Too long feels late.' },
        ],
      },
    ],
  }),

  dry: infoDoc({
    name: 'Dry',
    lead: 'The original signal, delayed by the same amount as the layers.',
    meta: [
      { label: 'DAW name', value: 'Dry' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '1 (on)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [{ p: 'Off, you hear the octave stack without the original. Level and Balance are this voice. Listen solos it.' }],
      },
    ],
  }),

  m1: infoDoc({
    name: '−1',
    lead: 'A pitched copy one octave down, rebuilt from the original tone.',
    meta: [
      { label: 'DAW name', value: '−1' },
      { label: 'Parameter ID', value: '17' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'This keeps the original colour, within Formant and Tone. It is not Sub. Sub is an oscillator locked to half the fundamental.' },
        ],
      },
    ],
  }),

  m2: infoDoc({
    name: '−2',
    lead: 'A pitched copy two octaves down.',
    meta: [
      { label: 'DAW name', value: '−2' },
      { label: 'Parameter ID', value: '23' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [{ p: 'Heavier than −1, and more likely to gargle. Formant high and Tone dark usually sit it under the dry. Sub is the cleaner way to add bottom.' }],
      },
    ],
  }),

  p1: infoDoc({
    name: '+1',
    lead: 'A pitched copy one octave up.',
    meta: [
      { label: 'DAW name', value: '+1' },
      { label: 'Parameter ID', value: '29' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [{ p: 'Formant high keeps the body from riding up with the pitch. Tone can bring the top of this layer forward.' }],
      },
    ],
  }),

  sub: infoDoc({
    name: 'Sub',
    lead: 'An oscillator locked to half the detected fundamental.',
    meta: [
      { label: 'DAW name', value: 'Sub' },
      { label: 'Parameter ID', value: '35' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '1 (on)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'It is not a pitch shift of the original. Wave sets the shape. Harmonics softens extra grit into it. Tone darkens it. Gate and Unvoiced keep it quiet in the pauses.' },
        ],
      },
    ],
  }),

  listen: infoDoc({
    name: 'Listen',
    lead: 'Solos this voice.',
    meta: [
      { label: 'Parameter IDs', value: 'Dry 16. −1 is 22. −2 is 28. +1 is 34. Sub is 41.' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [{ p: 'Use it to hear Formant, Tone, or Wave without the rest of the stack. If more than one Listen is on, the first in the order Dry, −1, −2, +1, Sub is the one you hear. Bypass blocks it.' }],
      },
    ],
  }),

  level: infoDoc({
    name: 'Level',
    lead: 'Sets how loud this voice is.',
    meta: [
      { label: 'Parameter IDs', value: 'Dry 14. −1 is 18. −2 is 24. +1 is 30. Sub is 36.' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: 'Dry 0 dB. The others follow the source you last wrote.' },
    ],
  }),

  balance: infoDoc({
    name: 'Balance',
    lead: 'Pans this voice.',
    meta: [
      { label: 'Parameter IDs', value: 'Dry 15. −1 is 19. −2 is 25. +1 is 31. Sub is 37.' },
      { label: 'Range', value: '−1 … +1. −1 is left, +1 is right, 0 is centre.' },
      { label: 'Default', value: '0' },
    ],
  }),

  formant: infoDoc({
    name: 'Formant',
    lead: 'Sets how much of the original tone colour is put back on this pitched voice.',
    meta: [
      { label: 'Parameter IDs', value: '−1 is 20. −2 is 26. +1 is 32. Sub has no formant.' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [{ p: 'High keeps the body while the pitch moves. Low lets the colour ride with the pitch.' }],
      },
    ],
  }),

  tone: infoDoc({
    name: 'Tone',
    lead: 'Sets the brightness of this voice.',
    meta: [
      { label: 'Parameter IDs', value: '−1 is 21. −2 is 27. +1 is 33. Sub is 40.' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [{ p: 'Darker sets the layer back. Brighter brings it forward. Each voice has its own.' }],
      },
    ],
  }),

  subWave: infoDoc({
    name: 'Wave',
    lead: 'Sets the shape of the Sub oscillator.',
    meta: [
      { label: 'DAW name', value: 'Sub Wave' },
      { label: 'Parameter ID', value: '38' },
      { label: 'Stored range', value: '0…3. The buttons send Sine 0, Triangle 1, Square 2, Saw 3.' },
      { label: 'Default', value: '0 (Sine)' },
    ],
  }),

  subHarm: infoDoc({
    name: 'Harmonics',
    lead: 'Soft saturation on Sub.',
    meta: [
      { label: 'DAW name', value: 'Sub Harm' },
      { label: 'Parameter ID', value: '39' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '35 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [{ p: 'Low stays close to the wave you picked. Higher adds grit. Tone decides how much of that grit you keep.' }],
      },
    ],
  }),

  history: infoDoc({
    name: 'Roll',
    lead: 'The last 10 seconds of the detected pitch and the layers that are on.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'Traces draw while the sound is voiced. Dry is the detected fundamental. −1, −2, +1, and Sub sit on their own pitches. Suspect dots mark an octave the detector does not trust. This is a display.',
          },
        ],
      },
    ],
  }),
} as const;
