/** Hover titles for Split controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const splitInfo = {
  volumeL: infoDoc({
    name: 'Volume L',
    lead: 'Sets the level of the left output. The mono input is sent to both sides first.',
    meta: [
      { label: 'DAW name', value: 'Volume L' },
      { label: 'Parameter ID', value: '2' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Use it when the two destinations need different levels. The right output is not this knob. The header In and Out gains always apply. There is no bypass.',
          },
        ],
      },
    ],
  }),

  volumeR: infoDoc({
    name: 'Volume R',
    lead: 'Sets the level of the right output. It is the same mono source as the left.',
    meta: [
      { label: 'DAW name', value: 'Volume R' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '0 dB' },
    ],
  }),

  muteL: infoDoc({
    name: 'Mute L',
    lead: 'Silences the left output.',
    meta: [
      { label: 'DAW name', value: 'Mute L' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
  }),

  muteR: infoDoc({
    name: 'Mute R',
    lead: 'Silences the right output.',
    meta: [
      { label: 'DAW name', value: 'Mute R' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
  }),

  phaseL: infoDoc({
    name: 'Phase L',
    lead: 'Flips the polarity of the left output.',
    meta: [
      { label: 'DAW name', value: 'Phase L' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Use it when this side cancels against another copy of the same source. The right side is not flipped by this.',
          },
        ],
      },
    ],
  }),

  phaseR: infoDoc({
    name: 'Phase R',
    lead: 'Flips the polarity of the right output.',
    meta: [
      { label: 'DAW name', value: 'Phase R' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
  }),
} as const;
