/** Hover titles for Crusher controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const crusherInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Lets the signal through with no bit reduction.',
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
          { p: 'While it is on, the header In and Out gains are unity. The history still draws the level going through.' },
        ],
      },
    ],
  }),

  channel: infoDoc({
    name: 'Channel',
    lead: 'Chooses which part of the stereo signal is crushed.',
    meta: [
      { label: 'DAW name', value: 'Channel' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Stored range', value: '0…4. The buttons send Stereo 0, Left 1, Right 2, Mid 3, Side 4.' },
      { label: 'Default', value: '0 (Stereo)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Stereo crushes both sides.',
              'Left or Right crushes that side. The other stays dry.',
              'Mid crushes the centre and leaves the wide part alone. Side crushes the wide part and leaves the centre alone.',
            ],
          },
          { p: 'Mix blends crushed and dry inside the path you chose.' },
        ],
      },
    ],
  }),

  bits: infoDoc({
    name: 'Bit Reduction',
    lead: 'Sets how many steps the quantizer has.',
    meta: [
      { label: 'DAW name', value: 'Bit Reduction' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Range', value: '1 … 16. The knob is continuous. The ticks are whole bit depths.' },
      { label: 'Default', value: '4' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '16 is almost the original. Lower numbers are fewer, larger steps, so the sound gets gritty and the quiet parts fall into the lowest step. 1 is the coarsest.',
          },
        ],
      },
    ],
  }),

  morph: infoDoc({
    name: 'Mix',
    lead: 'Blends the crushed signal with the dry one.',
    meta: [
      { label: 'DAW name', value: 'Mix' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '50 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: '0 is dry. 100 % is fully the quantizer. The blend is linear, on the path Channel selected.' },
        ],
      },
    ],
  }),

  mode: infoDoc({
    name: 'Logarithmic',
    lead: 'Chooses whether the steps are equal in level or spaced on a curve.',
    meta: [
      { label: 'DAW name', value: 'Logarithmic' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Stored value', value: '0…1. Logarithmic at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (Linear)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Linear, the start, uses equal steps across the level. Logarithmic places the steps on a curve of the level, so the quiet part and the loud part are not stepped the same way. The Response chart draws the curve you have selected.',
          },
        ],
      },
    ],
  }),

  dc: infoDoc({
    name: 'DC',
    lead: 'Pushes the positive and negative halves apart before the steps, then takes the offset back off.',
    meta: [
      { label: 'DAW name', value: 'DC' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '−12 … +12 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 the two halves are stepped the same way. Away from 0, one half is stretched and the other is squeezed, so the crush is no longer symmetrical. The Response chart shows the bend.',
          },
        ],
      },
    ],
  }),

  aa: infoDoc({
    name: 'Anti-Aliasing',
    lead: 'Softens the jump from one step to the next. It is not a lowpass.',
    meta: [
      { label: 'DAW name', value: 'Anti-Aliasing' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '50 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 is a hard staircase. Higher values round the corners between steps. It does not filter the highs out of the signal. The Response chart shows how round the steps are.',
          },
        ],
      },
    ],
  }),

  history: infoDoc({
    name: 'History',
    lead: 'Shows the last 8 seconds of the level going in and the level coming out.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          { p: 'The crushed path is usually quieter in the quiet parts, because those samples have fallen into a lower step. Bypass draws the signal going through at unity gain.' },
        ],
      },
    ],
  }),

  chart: infoDoc({
    name: 'Response',
    lead: 'Shows the quantizer: input level across, output level up.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'Bit Reduction sets how many steps there are. Logarithmic bends their spacing. DC skews the two halves. Anti-Aliasing rounds the corners. Mix pulls the curve back toward a straight line. The moving mark is where the signal is sitting on that curve.',
          },
        ],
      },
    ],
  }),
} as const;
