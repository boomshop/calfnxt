/** Hover titles for Stereo controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const stereoInfo = {
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
            p: 'While it is on, the header In and Out gains are unity. The goniometer and the correlation meter clear. The delay is not in this path.',
          },
        ],
      },
    ],
  }),

  mode: infoDoc({
    name: 'Mode',
    lead: 'Chooses how the two input lanes are arranged before the rest of the controls.',
    meta: [
      { label: 'DAW name', value: 'Mode' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Stored range', value: '0…6. See the list.' },
      { label: 'Default', value: '0 (LR → LR)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'LR → LR keeps left and right. Level L and Level R are those sides.',
              'LR → MS turns the pair into mid and side. Level L is the centre, Level R is the width, and the output stays in that encoding.',
              'MS → LR expects a mid/side input and turns it back into left and right.',
              'LR → LL copies the left to both outputs. LR → RR copies the right. LR → L+R sums them to mono on both.',
              'LR → RL swaps the sides.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The buttons send those modes as 0 through 6 in that order. Mid and side level, pan, and balance run on LR → LR, MS → LR, and LR → RL. LR → MS uses the levels and S Bal, and does not use M Pan. The three folds to one channel ignore the mid and side controls. Decorrelation is skipped on LR → MS and on those three folds.',
          },
        ],
      },
    ],
  }),

  levelL: infoDoc({
    name: 'Level L',
    lead: 'Turns the first input lane up or down, before the matrix.',
    meta: [
      { label: 'DAW name', value: 'Level L' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Range', value: '−36 … +36 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'In LR modes this is the left. In LR → MS it is the centre. It is the lane, not the output balance.',
          },
        ],
      },
    ],
  }),

  levelR: infoDoc({
    name: 'Level R',
    lead: 'Turns the second input lane up or down, before the matrix.',
    meta: [
      { label: 'DAW name', value: 'Level R' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '−36 … +36 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'In LR modes this is the right. In LR → MS it is the side.',
          },
        ],
      },
    ],
  }),

  mlev: infoDoc({
    name: 'M Level',
    lead: 'Turns the centre up or down after the mode matrix.',
    meta: [
      { label: 'DAW name', value: 'M Level' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '−36 … +36 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Up, and what both sides share gets louder. Down, and the centre thins, so the sides are relatively wider. A deep cut can leave a hole in the middle.',
          },
        ],
      },
    ],
  }),

  mpan: infoDoc({
    name: 'M Pan',
    lead: 'Places the centre toward the left or the right.',
    meta: [
      { label: 'DAW name', value: 'M Pan' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '−1 … +1' },
      { label: 'Default', value: '0' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 keeps the centre in the middle. −1 puts it fully on the left. +1 puts it fully on the right. The side is not this control.',
          },
        ],
      },
    ],
  }),

  slev: infoDoc({
    name: 'S Level',
    lead: 'Turns the side, the difference between the channels, up or down.',
    meta: [
      { label: 'DAW name', value: 'S Level' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Range', value: '−36 … +36 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Up widens the image. Down narrows it. At a deep cut the result is close to mono. A very wide side can cancel when the mix is summed.',
          },
        ],
      },
    ],
  }),

  sbal: infoDoc({
    name: 'S Bal',
    lead: 'Balances the side toward the left or the right.',
    meta: [
      { label: 'DAW name', value: 'S Bal' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Range', value: '−1 … +1' },
      { label: 'Default', value: '0' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 keeps the side even. −1 puts it on the left, +1 on the right. The centre stays where M Pan put it.',
          },
        ],
      },
    ],
  }),

  decorr: infoDoc({
    name: 'Decorr',
    lead: 'Spreads the side above the crossover without changing the mono sum of that band.',
    meta: [
      { label: 'DAW name', value: 'Decorr' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The lows under the crossover stay as they were. The highs are blended with a decorrelated copy, and the centre of that band is put back so a mono sum of the highs does not drop. It does nothing on LR → MS, LR → LL, LR → RR, and LR → L+R, and nothing while Amount is at 0.',
          },
        ],
      },
    ],
  }),

  decorrAmount: infoDoc({
    name: 'Amount',
    lead: 'Sets how much of the high side is the decorrelated copy.',
    meta: [
      { label: 'DAW name', value: 'Amount' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Range', value: '0 … 1' },
      { label: 'Default', value: '0.5' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 is the original high side. 1 is fully the decorrelated pair. The blend is linear. You only hear it while Decorr is on and the mode allows it.',
          },
        ],
      },
    ],
  }),

  decorrXover: infoDoc({
    name: 'Xover',
    lead: 'Sets the frequency under which the side is left alone.',
    meta: [
      { label: 'DAW name', value: 'Xover' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Range', value: '80 … 2 000 Hz' },
      { label: 'Default', value: '400 Hz' },
    ],
    sections: [
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Higher keeps more of the low mids tight. Lower lets decorrelation reach further down. The split is compensated, so the low side and the high side still add back without a notch when Amount is 0.',
          },
        ],
      },
    ],
  }),

  decorrSlope: infoDoc({
    name: 'Slope',
    lead: 'Sets how steep that split is.',
    meta: [
      { label: 'DAW name', value: 'Slope' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Stored range', value: 'The knob snaps to 12, 24, or 48 dB/oct.' },
      { label: 'Default', value: '24 dB/oct' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Steeper keeps the bass more cleanly out of the decorrelator. Gentler shares more around the crossover. There is no 36.',
          },
        ],
      },
    ],
  }),

  decorrStages: infoDoc({
    name: 'Stages',
    lead: 'Sets how many decorrelation stages run on the high side.',
    meta: [
      { label: 'DAW name', value: 'Stages' },
      { label: 'Parameter ID', value: '14' },
      { label: 'Range', value: '1 … 8' },
      { label: 'Default', value: '4' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'More stages smear the high side further. Fewer leave it closer to the original. The centre is still restored either way.',
          },
        ],
      },
    ],
  }),

  decorrSpread: infoDoc({
    name: 'Spread',
    lead: 'Sets how differently the left and right decorrelation chains are tuned.',
    meta: [
      { label: 'DAW name', value: 'Spread' },
      { label: 'Parameter ID', value: '15' },
      { label: 'Range', value: '0 … 1' },
      { label: 'Default', value: '0.5' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Higher makes the two chains diverge more, so the high side gets wider. Lower keeps them closer. The mono sum of that band is still the original centre.',
          },
        ],
      },
    ],
  }),

  muteL: infoDoc({
    name: 'Mute L',
    lead: 'Silences the first lane after the spatial processing.',
    meta: [
      { label: 'DAW name', value: 'Mute L' },
      { label: 'Parameter ID', value: '16' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
  }),

  muteR: infoDoc({
    name: 'Mute R',
    lead: 'Silences the second lane after the spatial processing.',
    meta: [
      { label: 'DAW name', value: 'Mute R' },
      { label: 'Parameter ID', value: '17' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
  }),

  phaseL: infoDoc({
    name: 'Phase L',
    lead: 'Flips the polarity of the first lane.',
    meta: [
      { label: 'DAW name', value: 'Phase L' },
      { label: 'Parameter ID', value: '18' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Use it when this lane cancels against another copy of the same source. Check the correlation meter. A sustained negative reading means the sum will thin in mono.',
          },
        ],
      },
    ],
  }),

  phaseR: infoDoc({
    name: 'Phase R',
    lead: 'Flips the polarity of the second lane.',
    meta: [
      { label: 'DAW name', value: 'Phase R' },
      { label: 'Parameter ID', value: '19' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
  }),

  delay: infoDoc({
    name: 'Delay',
    lead: 'Delays one lane against the other.',
    meta: [
      { label: 'DAW name', value: 'Delay' },
      { label: 'Parameter ID', value: '20' },
      { label: 'Range', value: '−20 … +20 ms' },
      { label: 'Default', value: '0 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'These are real milliseconds. Positive delays the right lane. Negative delays the left. A few milliseconds widens the image. Toward 20 ms the offset becomes an echo. The move is smoothed so it does not click. In mono the delayed side can thin the centre.',
          },
        ],
      },
    ],
  }),

  stereoBase: infoDoc({
    name: 'Stereo Base',
    lead: 'Widens the pair or folds it toward mono.',
    meta: [
      { label: 'DAW name', value: 'Stereo Base' },
      { label: 'Parameter ID', value: '21' },
      { label: 'Range', value: '−1 … +1' },
      { label: 'Default', value: '0' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 leaves the width as it is. −1 is the mono sum of the two lanes. Positive pushes the sides apart past the input width. The negative half of the knob is scaled so that the end of the travel is that mono sum, and the positive half can go further outward.',
          },
        ],
      },
    ],
  }),

  stereoPhase: infoDoc({
    name: 'Stereo Phase',
    lead: 'Rotates the left/right pair.',
    meta: [
      { label: 'DAW name', value: 'Stereo Phase' },
      { label: 'Parameter ID', value: '22' },
      { label: 'Range', value: '0 … 360°' },
      { label: 'Default', value: '0°' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 leaves the pair. 180° flips both polarities together. The angles between move energy from one side into the other. Watch the correlation meter if the low end starts to cancel.',
          },
        ],
      },
    ],
  }),

  balanceOut: infoDoc({
    name: 'Balance Out',
    lead: 'Turns one output down. It does not turn the other one up.',
    meta: [
      { label: 'DAW name', value: 'Balance Out' },
      { label: 'Parameter ID', value: '23' },
      { label: 'Range', value: '−1 … +1' },
      { label: 'Default', value: '0' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Positive lowers the left, and at +1 the left is silent. Negative lowers the right, and at −1 the right is silent. The other side stays at unity.',
          },
        ],
      },
    ],
  }),

  gonio: infoDoc({
    name: 'Goniometer',
    lead: 'Plots each sample as left against right. It is a meter, not a control.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: 'A vertical line is mono. A cloud that spreads left and right is wider. A thin diagonal the other way is polarity trouble. Bypass clears the display.',
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
            p: 'Near +1, the sides move together and will survive a mono sum. Around 0, the image is wide. Negative means the sides are opposing, and the low end can cancel in mono. A short dip is ordinary. A reading that stays negative is the one to fix.',
          },
        ],
      },
    ],
  }),
} as const;
