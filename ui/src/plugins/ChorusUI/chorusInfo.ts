/** Hover titles for Chorus controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';
import type { FrequencyRangeInfo } from '../../widgets/FrequencyRange/frequencyRangeInfo';

export const chorusInfo = {
  active: infoDoc({
    name: 'Active',
    lead: 'Turns the chorus voices on or off. Dry stays at the level you set.',
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
            p: 'Off, Amount is silent unless Listen is on. The LFOs keep their place. The header In and Out gains always apply.',
          },
        ],
      },
    ],
  }),

  channel: infoDoc({
    name: 'Channel',
    lead: 'Chooses which part of the stereo signal gets the chorus voices.',
    meta: [
      { label: 'DAW name', value: 'Channel' },
      { label: 'Parameter ID', value: '19' },
      { label: 'Stored range', value: '0…4. The buttons send Stereo 0, Left 1, Right 2, Mid 3, Side 4.' },
      { label: 'Default', value: '0 (Stereo)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Stereo choruses both sides. Stereo Phase is the offset between their LFOs.',
              'Left or Right choruses that side. The other stays dry.',
              'Mid choruses the centre. Side choruses the wide part. Each uses one chorus, then the picture is decoded.',
            ],
          },
        ],
      },
    ],
  }),

  minDelay: infoDoc({
    name: 'Min Delay',
    lead: 'Sets the shortest delay of the voices.',
    meta: [
      { label: 'DAW name', value: 'Min Delay' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Range', value: '0.1 … 10 ms' },
      { label: 'Default', value: '5 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'These are real milliseconds. A short minimum is a tight chorus. Longer starts to sound like a small slap. Mod Depth is added on top of this.',
          },
        ],
      },
    ],
  }),

  modDepth: infoDoc({
    name: 'Depth',
    lead: 'Sets how far the LFOs stretch the delay above the minimum.',
    meta: [
      { label: 'DAW name', value: 'Mod Depth' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '0.1 … 10 ms' },
      { label: 'Default', value: '6 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'These are real milliseconds. A small depth is a gentle thicken. A large one is an obvious pitch wobble. The voices share this depth and are spread by Overlap.',
          },
        ],
      },
    ],
  }),

  modRate: infoDoc({
    name: 'Rate',
    lead: 'Sets how fast the LFOs move.',
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
          { p: 'These are real cycles per second. 0.1 Hz is one sweep every 10 seconds. LFO off holds the voices where they stopped.' },
        ],
      },
    ],
  }),

  stereo: infoDoc({
    name: 'Stereo Phase',
    lead: 'Offsets the right LFO against the left, in degrees.',
    meta: [
      { label: 'DAW name', value: 'Stereo Phase' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '0 … 360°' },
      { label: 'Default', value: '180°' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 moves both sides together. 180, the default, moves them opposite, which widens the chorus. Mid and Side use one chorus, so this offset is not that path. Reset puts the left LFO at 0° and the right at this angle.',
          },
        ],
      },
    ],
  }),

  voices: infoDoc({
    name: 'Voices',
    lead: 'Sets how many delayed copies are summed on each side.',
    meta: [
      { label: 'DAW name', value: 'Voices' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '1 … 8' },
      { label: 'Default', value: '4' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'One voice is a single moving delay. More voices thicken the sound. Their level is scaled so adding voices does not simply get louder. Inter-Voice Phase and Overlap decide how those copies are spread.',
          },
        ],
      },
    ],
  }),

  vphase: infoDoc({
    name: 'Inter-Voice Phase',
    lead: 'Spreads the voices around the LFO cycle.',
    meta: [
      { label: 'DAW name', value: 'Inter-Voice Phase' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Range', value: '0 … 360°' },
      { label: 'Default', value: '64°' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The number is the span from the first voice to the last. The steps between them are equal. 0 puts every voice on the same point of the cycle, so they move together. Wider spreads the wobble.',
          },
        ],
      },
    ],
  }),

  overlap: infoDoc({
    name: 'Overlap',
    lead: 'Sets how much the voices share the same delay range.',
    meta: [
      { label: 'DAW name', value: 'Overlap' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '75 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '100 % puts every voice in the same delay band. They still differ by Inter-Voice Phase. Lower values spread the voices across a wider set of delays, so the chorus is less of one moving copy and more of a stack. The Position chart shows that spread.',
          },
        ],
      },
    ],
  }),

  amount: infoDoc({
    name: 'Amount',
    lead: 'Sets the level of the chorus voices that is added to Dry.',
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
          { p: 'This is added, not a crossfade. Active off takes it out, unless Listen is on. The post filter is on this path.' },
        ],
      },
    ],
  }),

  dry: infoDoc({
    name: 'Dry',
    lead: 'Sets the level of the signal that is not chorused.',
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
          { p: 'Leave it near 0 and the voices sit beside the original. The post filter does not touch this path. It stays audible while Active is off.' },
        ],
      },
    ],
  }),

  lfo: infoDoc({
    name: 'LFO',
    lead: 'Runs or holds the motion of the voices.',
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
          { p: 'Off, the delays stay where the LFOs stopped. On, the motion continues from there.' },
        ],
      },
    ],
  }),

  reset: infoDoc({
    name: 'Reset',
    lead: 'Puts the left LFO at 0° and the right LFO at the Stereo Phase.',
    meta: [
      { label: 'DAW name', value: 'Reset' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Stored value', value: '0…1. The button writes a reset.' },
      { label: 'Default', value: '0' },
    ],
  }),

  listen: infoDoc({
    name: 'Listen',
    lead: 'Lets you hear the chorus voices without Dry.',
    meta: [
      { label: 'DAW name', value: 'Listen' },
      { label: 'Parameter ID', value: '18' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'You hear the voices after the post filter, at the Amount level. Left silences the right output. Right silences the left. Stereo, Mid, and Side play the filtered voices on both sides of the path you chose. It still works while Active is off.',
          },
        ],
      },
    ],
  }),

  post: infoDoc({
    name: 'Post Filter',
    lead: 'A highpass and a lowpass on the chorus voices. Dry is not filtered.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Use it to take mud or hiss out of the voices without dulling the dry signal. Both slopes start at Off, so the corners do nothing until you turn a slope on. Listen solos this filtered path.',
          },
        ],
      },
    ],
  }),

  chart: infoDoc({
    name: 'Position',
    lead: 'Shows where the voices sit in the delay and in the LFO cycle.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'It is not a frequency response. More voices, a lower Overlap, and a wider Inter-Voice Phase spread the marks. LFO off holds them.',
          },
        ],
      },
    ],
  }),
} as const;

export const chorusPostInfo: FrequencyRangeInfo = {
  hipass: infoDoc({
    name: 'Highpass',
    lead: 'Sets how much low end is taken out of the chorus voices.',
    meta: [
      { label: 'DAW name', value: 'HP Freq' },
      { label: 'Parameter ID', value: '14' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '100 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          { p: 'Dry is not filtered. The slope has to be above Off or this corner is not in the voices.' },
        ],
      },
    ],
  }),
  lopass: infoDoc({
    name: 'Lowpass',
    lead: 'Sets how much top is taken out of the chorus voices.',
    meta: [
      { label: 'DAW name', value: 'LP Freq' },
      { label: 'Parameter ID', value: '15' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '5 000 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          { p: 'Dry is not filtered. The slope has to be above Off or this corner is not in the voices.' },
        ],
      },
    ],
  }),
  hpMode: infoDoc({
    name: 'Highpass slope',
    lead: 'Sets how steeply the lows are taken out of the voices.',
    meta: [
      { label: 'DAW name', value: 'HP Mode' },
      { label: 'Parameter ID', value: '16' },
      { label: 'Stored range', value: 'The buttons send Off 0, 12 dB 1, 24 dB 2, 48 dB 4.' },
      { label: 'Default', value: '0 (Off)' },
    ],
  }),
  lpMode: infoDoc({
    name: 'Lowpass slope',
    lead: 'Sets how steeply the highs are taken out of the voices.',
    meta: [
      { label: 'DAW name', value: 'LP Mode' },
      { label: 'Parameter ID', value: '17' },
      { label: 'Stored range', value: 'The buttons send Off 0, 12 dB 1, 24 dB 2, 48 dB 4.' },
      { label: 'Default', value: '0 (Off)' },
    ],
  }),
};
