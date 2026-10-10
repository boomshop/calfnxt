/** Hover titles for Flanger controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const flangerInfo = {
  active: infoDoc({
    name: 'Active',
    lead: 'Turns the flanged signal on or off. Dry stays at the level you set.',
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
            p: 'Off, you hear Dry only. The LFO and the response chart keep moving. The header In and Out gains always apply.',
          },
        ],
      },
    ],
  }),

  channel: infoDoc({
    name: 'Channel',
    lead: 'Chooses which part of the stereo signal is flanged.',
    meta: [
      { label: 'DAW name', value: 'Channel' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Stored range', value: '0…4. The buttons send Stereo 0, Left 1, Right 2, Mid 3, Side 4.' },
      { label: 'Default', value: '0 (Stereo)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Stereo flanges both sides. Stereo Phase is the offset between their LFOs.',
              'Left or Right flanges that side. The other stays dry.',
              'Mid flanges the centre. Side flanges the wide part. Each uses one flanger, then the picture is decoded.',
            ],
          },
        ],
      },
    ],
  }),

  minDelay: infoDoc({
    name: 'Min Delay',
    lead: 'Sets the shortest delay of the comb.',
    meta: [
      { label: 'DAW name', value: 'Min Delay' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Range', value: '0.1 … 10 ms' },
      { label: 'Default', value: '0.5 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'These are real milliseconds. Shorter packs the notches tighter and brighter. Longer spaces them further apart. Mod Depth is added on top of this minimum.',
          },
        ],
      },
    ],
  }),

  modDepth: infoDoc({
    name: 'Depth',
    lead: 'Sets how far the LFO stretches the delay above the minimum.',
    meta: [
      { label: 'DAW name', value: 'Mod Depth' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '0.1 … 10 ms' },
      { label: 'Default', value: '2 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'These are real milliseconds. A small depth is a gentle swirl. A large one is the whoosh. The comb you hear runs from Min Delay to Min Delay plus this depth.',
          },
        ],
      },
    ],
  }),

  modRate: infoDoc({
    name: 'Rate',
    lead: 'Sets how fast the LFO moves the delay.',
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
          { p: 'These are real cycles per second. 0.1 Hz is one sweep every 10 seconds. LFO off holds the comb where it stopped.' },
        ],
      },
    ],
  }),

  feedback: infoDoc({
    name: 'Feedback',
    lead: 'Feeds the delayed signal back into the delay.',
    meta: [
      { label: 'DAW name', value: 'Feedback' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '−0.99 … +0.99' },
      { label: 'Default', value: '0.8' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Positive sharpens the metallic peaks. Negative deepens the notches the other way. Near either end the comb can ring. The default is already strong.',
          },
        ],
      },
    ],
  }),

  stereo: infoDoc({
    name: 'Stereo Phase',
    lead: 'Offsets the right LFO against the left, in degrees.',
    meta: [
      { label: 'DAW name', value: 'Stereo Phase' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '0 … 360°' },
      { label: 'Default', value: '90°' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 sweeps both sides together. 90, the default, is a quarter-cycle apart. 180 sweeps them opposite. Mid and Side use one flanger, so this offset is not that path.',
          },
        ],
      },
    ],
  }),

  amount: infoDoc({
    name: 'Amount',
    lead: 'Sets the level of the flanged signal that is added to Dry.',
    meta: [
      { label: 'DAW name', value: 'Amount' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '−6 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          { p: 'This is added, not a crossfade. Above 0 dB the peaks can get hot with Feedback up. Active off takes this path out.' },
        ],
      },
    ],
  }),

  dry: infoDoc({
    name: 'Dry',
    lead: 'Sets the level of the signal that is not flanged.',
    meta: [
      { label: 'DAW name', value: 'Dry' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          { p: 'Leave it near 0 and the comb sits beside the original. Turn it down for a wetter sweep. It stays audible while Active is off.' },
        ],
      },
    ],
  }),

  lfo: infoDoc({
    name: 'LFO',
    lead: 'Runs or holds the sweep.',
    meta: [
      { label: 'DAW name', value: 'LFO' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '1 (on)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          { p: 'Off, the comb stays where the LFO stopped. On, the sweep continues from there.' },
        ],
      },
    ],
  }),

  reset: infoDoc({
    name: 'Reset',
    lead: 'Puts the left LFO at 0° and the right LFO at the Stereo Phase.',
    meta: [
      { label: 'DAW name', value: 'Reset' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Stored value', value: '0…1. The button writes a reset.' },
      { label: 'Default', value: '0' },
    ],
  }),

  chart: infoDoc({
    name: 'Response',
    lead: 'Shows the comb the flanger is making right now.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          { p: 'The notches move between Min Delay and Min Delay plus Depth. Freeze the LFO and the picture holds. Feedback sharpens what you see.' },
        ],
      },
    ],
  }),
} as const;
