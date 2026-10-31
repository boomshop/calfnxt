/** Hover titles for Phaser controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const phaserInfo = {
  active: infoDoc({
    name: 'Active',
    lead: 'Turns the phased signal on or off. Dry stays at the level you set.',
    meta: [
      { label: 'DAW name', value: 'Active' },
      { label: 'Parameter ID', value: '2' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '1 (on)' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Off, you hear Dry only. The LFO and the response chart keep moving. The header In and Out gains always apply. There is no separate bypass that forces them to unity.',
          },
        ],
      },
    ],
  }),

  channel: infoDoc({
    name: 'Channel',
    lead: 'Chooses which part of the stereo signal is phased.',
    meta: [
      { label: 'DAW name', value: 'Channel' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Stored range', value: '0…4. The buttons send Stereo 0, Left 1, Right 2, Mid 3, Side 4.' },
      { label: 'Default', value: '0 (Stereo)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Stereo phases both sides. Stereo Phase is the offset between their LFOs.',
              'Left or Right phases that side. The other stays dry.',
              'Mid phases the centre. Side phases the wide part. Each uses one phaser, then the picture is decoded.',
            ],
          },
        ],
      },
    ],
  }),

  baseFreq: infoDoc({
    name: 'Center',
    lead: 'Sets the frequency the notches sweep around.',
    meta: [
      { label: 'DAW name', value: 'Center Freq' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '1 000 Hz' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'Lower puts the swirl in the body of the sound. Higher puts it in the air. Mod Depth is how far the LFO travels from here, in cents.' },
        ],
      },
    ],
  }),

  modDepth: infoDoc({
    name: 'Depth',
    lead: 'Sets how far the LFO swings the notch frequency, in cents.',
    meta: [
      { label: 'DAW name', value: 'Mod Depth' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '0 … 10 800 ct' },
      { label: 'Default', value: '4 000 ct' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '100 cents is one semitone. 0 holds the notches still. The default is 40 semitones of travel. Very wide sweeps push notches out of the range you can hear as a tone, and the sound thins.',
          },
        ],
      },
    ],
  }),

  modRate: infoDoc({
    name: 'Rate',
    lead: 'Sets how fast the LFO moves.',
    meta: [
      { label: 'DAW name', value: 'Mod Rate' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '0.01 … 20 Hz' },
      { label: 'Default', value: '0.1 Hz' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'These are real cycles per second. 0.1 Hz is one sweep every 10 seconds. Faster becomes a flutter. LFO off holds the notches where they are.' },
        ],
      },
    ],
  }),

  feedback: infoDoc({
    name: 'Feedback',
    lead: 'Feeds the allpass output back into the cascade.',
    meta: [
      { label: 'DAW name', value: 'Feedback' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '−0.99 … +0.99' },
      { label: 'Default', value: '0.5' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Positive sharpens the peaks. Negative deepens the notches the other way. Near either end the cascade can ring. 0 is the allpasses alone.',
          },
        ],
      },
    ],
  }),

  stages: infoDoc({
    name: 'Stages',
    lead: 'Sets how many allpass stages are in the cascade.',
    meta: [
      { label: 'DAW name', value: 'Stages' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '1 … 12' },
      { label: 'Default', value: '6' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'More stages means more notches. 4 to 6 is the familiar swirl. Toward 12 the comb is denser and darker.' },
        ],
      },
    ],
  }),

  stereo: infoDoc({
    name: 'Stereo Phase',
    lead: 'Offsets the right LFO against the left, in degrees.',
    meta: [
      { label: 'DAW name', value: 'Stereo Phase' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Range', value: '0 … 360°' },
      { label: 'Default', value: '180°' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 sweeps both sides together. 180, the default, sweeps them opposite, which widens the image. Mid and Side use one phaser, so this offset is not that path. Reset puts the left LFO at 0° and the right at this angle.',
          },
        ],
      },
    ],
  }),

  amount: infoDoc({
    name: 'Amount',
    lead: 'Sets the level of the phased signal that is added to Dry.',
    meta: [
      { label: 'DAW name', value: 'Amount' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '−6 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          { p: 'This is added, not a crossfade. Dry stays. Above 0 dB the peaks can get hot, especially with Feedback up. Active off takes this path out.' },
        ],
      },
    ],
  }),

  dry: infoDoc({
    name: 'Dry',
    lead: 'Sets the level of the signal that is not phased.',
    meta: [
      { label: 'DAW name', value: 'Dry' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          { p: 'Leave it near 0 and the notches sit beside the original. Turn it down when you want mostly the phased sound. It stays audible while Active is off.' },
        ],
      },
    ],
  }),

  lfo: infoDoc({
    name: 'LFO',
    lead: 'Runs or holds the sweep.',
    meta: [
      { label: 'DAW name', value: 'LFO' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '1 (on)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          { p: 'Off, the notches stay where the LFO stopped. Use that to set Center, Depth, and Feedback on a still comb. On, the sweep continues from there.' },
        ],
      },
    ],
  }),

  reset: infoDoc({
    name: 'Reset',
    lead: 'Puts the left LFO at 0° and the right LFO at the Stereo Phase.',
    meta: [
      { label: 'DAW name', value: 'Reset' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Stored value', value: '0…1. The button writes a reset.' },
      { label: 'Default', value: '0' },
    ],
  }),

  chart: infoDoc({
    name: 'Response',
    lead: 'Shows the comb the phaser is making right now, dry and wet together.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          { p: 'The notches move with the LFO. Freeze the LFO and the picture holds, so you can see the Center and the Feedback without the sweep. Active off takes the wet part out of the sound. The chart can still be drawing the moving response.' },
        ],
      },
    ],
  }),
} as const;
