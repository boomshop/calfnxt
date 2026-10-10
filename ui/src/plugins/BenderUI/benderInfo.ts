/** Hover titles for Bender controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const benderInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Lets the signal through with no pitch shift. You still hear the delayed dry path, so the timing does not jump.',
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
            p: 'The delay stays in the path, and the host keeps the reported latency. The header In and Out gains are unity while it is on.',
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
      { label: 'Parameter ID', value: '9' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          { p: 'Right-channel content is ignored. Leave it off when the two sides should keep their own image through the throw.' },
        ],
      },
    ],
  }),

  pitch: infoDoc({
    name: 'Pitch',
    lead: 'The throw, in semitones. Centre is unison.',
    meta: [
      { label: 'DAW name', value: 'Pitch' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Range', value: '−24 … +24 st' },
      { label: 'Default', value: '0 st' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Up raises the pitch. Down drops it. This is a delay-line shift, so chords go through and the formants ride with the pitch. Near unison the shifter parks on one tap, so Mix does not comb. Snap decides whether this knob is free or locked to a grid.',
          },
        ],
      },
    ],
  }),

  snap: infoDoc({
    name: 'Snap',
    lead: 'Locks Pitch to a grid, in the knob and in the sound.',
    meta: [
      { label: 'DAW name', value: 'Snap' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Stored range', value: '0…2. The buttons send Free 0, ST 1, WT 2.' },
      { label: 'Default', value: '0 (Free)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Free is a continuous pedal. ST is whole semitones. WT is whole tones, two semitones at a time. Switching onto a grid pulls the current Pitch onto it. Automation is quantized the same way.',
          },
        ],
      },
    ],
  }),

  quality: infoDoc({
    name: 'Quality',
    lead: 'Sets the grain length, and with it the latency.',
    meta: [
      { label: 'DAW name', value: 'Quality' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Stored range', value: '0…3. The buttons send Fast 0, Normal 1, Smooth 2, Studio 3.' },
      { label: 'Default', value: '2 (Smooth)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The grains are 16, 32, 64, and 128 ms. The reported latency is about half of that. Fast is snappy and grainier. Studio is the cleanest sustain and the latest in the host. Changing it can make the host re-compensate.',
          },
        ],
      },
    ],
  }),

  mix: infoDoc({
    name: 'Mix',
    lead: 'Blends the shifted signal with a dry copy that is delayed by the same amount.',
    meta: [
      { label: 'DAW name', value: 'Mix' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '100 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '100 % is only the throw. Lower values keep the original beside the interval. Because the dry copy is delayed with the wet one, unison does not comb. Away from unison the two delays are not the same length, so a mid mix can chorus a little.',
          },
        ],
      },
    ],
  }),

  glide: infoDoc({
    name: 'Glide',
    lead: 'Sets how fast Pitch catches the knob.',
    meta: [
      { label: 'DAW name', value: 'Glide' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '0.5 … 250 ms' },
      { label: 'Default', value: '8 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'These are real milliseconds. The time constant of the slew is this number. Short is under the foot. Longer is a slide between notes, including between the steps of ST or WT.',
          },
        ],
      },
    ],
  }),

  tone: infoDoc({
    name: 'Tone',
    lead: 'A lowpass on the shifted path only.',
    meta: [
      { label: 'DAW name', value: 'Tone' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '80 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 puts the corner at 900 Hz. 100 % puts it at 18 kHz. The dry side of Mix is not filtered. Darken the throw when a big upward shift gets fizzy.',
          },
        ],
      },
    ],
  }),
} as const;
