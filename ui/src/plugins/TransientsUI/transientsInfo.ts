/** Hover titles for Transients controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';
import type { FrequencyRangeInfo } from '../../widgets/FrequencyRange/frequencyRangeInfo';

export const transientsInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Lets the signal through with no transient shaping, so you can compare the snap with the untouched sound.',
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
            p: 'While it is on, the header In and Out gains are unity, and you hear the input with no lookahead delay. Listen does not solo the detector. Turning it off returns the delayed, shaped path.',
          },
        ],
      },
    ],
  }),

  channel: infoDoc({
    name: 'Channel',
    lead: 'Chooses which part of the stereo signal is shaped. The detector listens to the same part.',
    meta: [
      { label: 'DAW name', value: 'Channel' },
      { label: 'Parameter ID', value: '20' },
      {
        label: 'Stored range',
        value: '0…4. The buttons send Stereo 0, Left 1, Right 2, Mid 3, Side 4.',
      },
      { label: 'Default', value: '0 (Stereo)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Stereo shapes both sides. Link decides which side the detector follows. Both sides still get that same gain.',
              'Left or Right shapes that side. The other side is the delayed dry signal, not shaped.',
              'Mid shapes the centre and leaves the wide part alone.',
              'Side shapes the wide part and leaves the centre alone.',
            ],
          },
        ],
      },
    ],
  }),

  mix: infoDoc({
    name: 'Mix',
    lead: 'Blends the shaped signal with the delayed dry one. 100 % is fully shaped.',
    meta: [
      { label: 'DAW name', value: 'Mix' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '100 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The dry signal is delayed by the lookahead, so the blend stays in time. Lower Mix and the original attack comes back beside the shaped one. At 0 % you hear that delay and no shaping. Delta and Soft Clip follow the shaped amount.',
          },
        ],
      },
    ],
  }),

  attackBoost: infoDoc({
    name: 'Attack',
    lead: 'Turns the start of the note up or down.',
    meta: [
      { label: 'DAW name', value: 'Attack Boost' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '−1 … +1' },
      { label: 'Default', value: '0' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Positive makes the hit snappier. Negative softens it. The two directions are not equal: a full boost pushes harder than a full cut pulls back. If the click gets thin or brittle, you have gone past the hit you wanted. Sensitivity decides how large a jump counts as an attack. Soft Clip only works while this is pushing the signal up.',
          },
        ],
      },
    ],
  }),

  lookahead: infoDoc({
    name: 'Lookahead',
    lead: 'Looks ahead by a number of samples so the shaper can catch the hit as it arrives.',
    meta: [
      { label: 'DAW name', value: 'Lookahead' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Range', value: '0 … 100 samples' },
      { label: 'Default', value: '0' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 the shaper reacts as the sample arrives, and a fast hit can be partly through before the gain moves. A few samples let the boost or the cut land on the click. Those samples are latency. Mix uses the same delay on the dry path.',
          },
        ],
      },
    ],
  }),

  releaseBoost: infoDoc({
    name: 'Release',
    lead: 'Turns the body after the hit up or down.',
    meta: [
      { label: 'DAW name', value: 'Release Boost' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Range', value: '−1 … +1' },
      { label: 'Default', value: '0' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Positive leaves more of the ring and the room. Negative tightens the note after the attack. Sustain Threshold is where this takes over from Attack. A full boost again pushes harder than a full cut pulls back.',
          },
        ],
      },
    ],
  }),

  attackTime: infoDoc({
    name: 'Attack Time',
    lead: 'Sets how long the front of the note is treated as the attack.',
    meta: [
      { label: 'DAW name', value: 'Attack Time' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '1 … 500 ms' },
      { label: 'Default', value: '30 ms' },
    ],
    sections: [
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'These are real milliseconds. Short catches the click or the beater. Longer pulls more of the front of the note into Attack. If Attack is changing the body you wanted Release to handle, shorten this or move Sustain Threshold.',
          },
        ],
      },
    ],
  }),

  sustain: infoDoc({
    name: 'Sustain',
    lead: 'Sets the level where the attack hands over to the body.',
    meta: [
      { label: 'DAW name', value: 'Sustain Threshold' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '−60 … 0 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 dB the handoff is as early as this control goes, so more of the note is the body. Lower it and the attack region lasts longer. Use it when Attack is still moving after the click, or when Release is grabbing the hit itself.',
          },
        ],
      },
    ],
  }),

  releaseTime: infoDoc({
    name: 'Release Time',
    lead: 'Sets how long the body shaping lasts.',
    meta: [
      { label: 'DAW name', value: 'Release Time' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '1 … 5000 ms' },
      { label: 'Default', value: '300 ms' },
    ],
    sections: [
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'These are real milliseconds. Short affects the early decay. Long follows the ring and the room. On a tight drum a long window keeps working after the note you meant to shape.',
          },
        ],
      },
    ],
  }),

  view: infoDoc({
    name: 'View',
    lead: 'Chooses what the history draws. It does not change the sound.',
    meta: [
      { label: 'DAW name', value: 'View Mode' },
      { label: 'Parameter ID', value: '10' },
      {
        label: 'Stored range',
        value: '0…3. The buttons send Output 0, Envelope 1, Attack 2, Release 3.',
      },
      { label: 'Default', value: '0 (Output)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Output is the delayed dry signal and the shaped one. A boost lifts the result off the dry fill. A cut drops it.',
              'Envelope is the detector the shaper is following.',
              'Attack and Release are the two followers. The handoff between them is Sustain.',
            ],
          },
        ],
      },
    ],
  }),

  history: infoDoc({
    name: 'History',
    lead: 'Shows the last few seconds of the view you picked.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'Output compares the delayed dry signal with the shaped one, before Delta. The other views follow the detector, the attack, or the release. The picture scales itself.',
          },
        ],
      },
    ],
  }),

  softClip: infoDoc({
    name: 'Soft Clip',
    lead: 'Rounds peaks only while the shaper is turning the signal up.',
    meta: [
      { label: 'DAW name', value: 'Soft Clip' },
      { label: 'Parameter ID', value: '16' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '0 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 there is no ceiling. Raise it when a boosted hit clips or sounds brittle. Quiet parts and a cut are left alone. At 100 % the rounding starts about 6 dB under full scale and eases into 0 dBFS. It does nothing while Attack and Release are not pushing the gain above unity.',
          },
        ],
      },
    ],
  }),

  link: infoDoc({
    name: 'Link',
    lead: 'Chooses which of the two sides the detector follows. Both sides still receive the same gain when Channel is Stereo.',
    meta: [
      { label: 'DAW name', value: 'Stereo Link' },
      { label: 'Parameter ID', value: '17' },
      { label: 'Stored range', value: '0…2. The buttons send Max 0, Avg 1, Mid 2.' },
      { label: 'Default', value: '0 (Max)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Max follows the louder side.',
              'Avg follows the average.',
              'Mid follows the centre. A loud side does not push the detector. On Stereo that side is still shaped with the centre.',
            ],
          },
        ],
      },
    ],
  }),

  sensitivity: infoDoc({
    name: 'Sensitivity',
    lead: 'Sets how large a jump has to be before Attack shapes it.',
    meta: [
      { label: 'DAW name', value: 'Sensitivity' },
      { label: 'Parameter ID', value: '18' },
      { label: 'Range', value: '0 … 12 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 every rise can move Attack, including hats and room flutter. Raise it and only a jump larger than that many decibels is shaped. It is not a loudness gate. A quiet hit still counts if the jump is big enough. Release is not gated by this.',
          },
        ],
      },
    ],
  }),

  delta: infoDoc({
    name: 'Delta',
    lead: 'Lets you hear only the difference between the shaped signal and the delayed dry one.',
    meta: [
      { label: 'DAW name', value: 'Delta' },
      { label: 'Parameter ID', value: '19' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The change Attack and Release are making. Silence means the gain is unity. A click means the attack moved. A tail means the body moved. On Left or Right, the untreated side is silent in this solo. Listen, when it is on, replaces this with the detector.',
          },
        ],
      },
    ],
  }),
} as const;

export const transientsDetectorInfo: FrequencyRangeInfo = {
  listen: infoDoc({
    name: 'Listen',
    lead: 'Lets you hear the detector filter instead of the shaped signal.',
    meta: [
      { label: 'DAW name', value: 'Listen' },
      { label: 'Parameter ID', value: '15' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The band the envelopes are following. The shaper is not in that solo. Use it to check that the kick, and not the cymbal, is what Attack is seeing. Bypass blocks it.',
          },
        ],
      },
    ],
  }),
  hipass: infoDoc({
    name: 'Highpass',
    lead: 'Sets the bottom of the band the detector hears. The audio path is not filtered by this.',
    meta: [
      { label: 'DAW name', value: 'Highpass' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '100 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Raise it when low rumble is triggering Attack. The slope has to be above Off or this corner is not in the detector.',
          },
        ],
      },
    ],
  }),
  lopass: infoDoc({
    name: 'Lowpass',
    lead: 'Sets the top of the band the detector hears. The audio path is not filtered by this.',
    meta: [
      { label: 'DAW name', value: 'Lowpass' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '5 000 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Lower it when cymbals or hiss are triggering Attack. The slope has to be above Off or this corner is not in the detector.',
          },
        ],
      },
    ],
  }),
  hpMode: infoDoc({
    name: 'Highpass slope',
    lead: 'Sets how steep the detector’s high-pass is. Off means the high-pass is not in the detector.',
    meta: [
      { label: 'DAW name', value: 'HP Mode' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Stored range', value: '0…4. The buttons send Off, 12, 24, 36, 48 dB/oct.' },
      { label: 'Default', value: '0 (Off)' },
    ],
  }),
  lpMode: infoDoc({
    name: 'Lowpass slope',
    lead: 'Sets how steep the detector’s low-pass is. Off means the low-pass is not in the detector.',
    meta: [
      { label: 'DAW name', value: 'LP Mode' },
      { label: 'Parameter ID', value: '14' },
      { label: 'Stored range', value: '0…4. The buttons send Off, 12, 24, 36, 48 dB/oct.' },
      { label: 'Default', value: '0 (Off)' },
    ],
  }),
};
