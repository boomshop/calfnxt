/** Hover titles for Elliptic controls. */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const ellipticInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Lets the stereo signal through with none of this processing, so you can compare the image with the untouched one.',
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
            p: 'While it is on, the header In and Out gains are unity and the goniometer and correlation meter clear. The crossover is reset, so the allpass phase is not in this path. Amount is the comparison that keeps that phase and only changes the bass width.',
          },
        ],
      },
    ],
  }),

  freq: infoDoc({
    name: 'Frequency',
    lead: 'Sets how far up the bass is pulled to the centre.',
    meta: [
      { label: 'DAW name', value: 'Frequency' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Range', value: '30 … 200 Hz' },
      { label: 'Default', value: '80 Hz' },
    ],
    sections: [
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'The low end of the travel only catches the bottom of the side. Toward 200 Hz the narrowing reaches the low mids, where a room and a wide instrument still read as stereo. The centre level does not change.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The side is split with a Linkwitz–Riley pair at this frequency. The mid runs the same pair and keeps both branches, so the mono sum stays level and the mid and the remaining side share one phase at the cutoff. 12 dB inverts the highpass branch so the two branches add instead of cancelling.',
          },
        ],
      },
    ],
  }),

  slope: infoDoc({
    name: 'Slope',
    lead: 'Sets how quickly the side bass falls away around that frequency.',
    meta: [
      { label: 'DAW name', value: 'Slope' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Stored range', value: '12 … 24. The buttons write 12 or 24 dB/oct. Values under 18 are 12, the rest are 24.' },
      { label: 'Default', value: '12 dB/oct' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '12 dB eases the side out. 24 dB keeps the split tighter. Neither cuts or boosts the centre. 24 dB shifts the bass a little further against the click, because the allpass on the whole signal is steeper.',
          },
        ],
      },
    ],
  }),

  amount: infoDoc({
    name: 'Amount',
    lead: 'Sets how much of the side bass is removed.',
    meta: [
      { label: 'DAW name', value: 'Amount' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '0 … 1' },
      { label: 'Default', value: '1' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: '0 leaves the stereo bass in place. 1 folds it to the centre. The steps between keep some of the width. Use this, rather than Bypass, when you want to hear only that fold: both ends of the knob sit on the same allpass, so the tone does not come and go.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The low side is turned down. The high side and the mid stay at full level and in phase with each other. The move takes about 10 ms, so a hard jump does not click.',
          },
        ],
      },
    ],
  }),

  listen: infoDoc({
    name: 'Listen',
    lead: 'Solos the bass that is sitting in the side, so you can hear what Frequency will fold to the centre.',
    meta: [
      { label: 'DAW name', value: 'Listen' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The low side only, in the centre. The rest of the mix is out. Amount does not change this solo. The goniometer keeps drawing the bass below Frequency, with Amount still applied.',
          },
        ],
      },
    ],
  }),

  gonio: infoDoc({
    name: 'Goniometer',
    lead: 'Plots the output below Frequency, left against right. Nothing above the split is drawn. It is a meter, not a control.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: 'A vertical line is mono bass. Raising Amount pulls the cloud onto that line. Bypass clears the display.',
          },
        ],
      },
    ],
  }),

  corr: infoDoc({
    name: 'Correlation',
    lead: 'Shows how alike the two outputs are, from −1 to +1. It is a meter, not a control.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: 'Near +1, the sides move together. It climbs as the side bass is removed, because that was the part most likely to cancel in mono. A reading that stays negative above the split is still worth finding in the mix.',
          },
        ],
      },
    ],
  }),
} as const;
