/** Hover titles for Harmonics controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';
import type { FrequencyRangeInfo } from '../../widgets/FrequencyRange/frequencyRangeInfo';

const slope =
  'The buttons send Off 0, 12 dB 1, 24 dB 2, 48 dB 4.';

export const harmonicsInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Lets the signal through with no harmonics added.',
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
          { p: 'While it is on, the header In and Out gains are unity. Listen does not solo the feed or the wet path.' },
        ],
      },
    ],
  }),

  channel: infoDoc({
    name: 'Channel',
    lead: 'Chooses which part of the stereo signal gets the added harmonics.',
    meta: [
      { label: 'DAW name', value: 'Channel' },
      { label: 'Parameter ID', value: '20' },
      { label: 'Stored range', value: '0…4. The buttons send Stereo 0, Left 1, Right 2, Mid 3, Side 4.' },
      { label: 'Default', value: '0 (Stereo)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            p: 'Dry always scales the whole stereo input. Wet adds only on the path you chose. Left or Right leaves the other side dry. Mid adds the same thing to both sides, which thickens the centre. Side adds it out of phase, which thickens the wide part.',
          },
        ],
      },
    ],
  }),

  drive: infoDoc({
    name: 'Drive',
    lead: 'Sets how hard the waveshaper is pushed.',
    meta: [
      { label: 'DAW name', value: 'Drive' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Range', value: '0.1 … 10' },
      { label: 'Default', value: '5' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Low is a gentle bend. High flattens the peaks and makes the overtones obvious. The Shape curve gets steeper, and the Harmonics bars show what a test tone through that curve contains. Wet is only the difference the shaper made, so Drive does not simply turn the dry signal up.',
          },
        ],
      },
    ],
  }),

  blend: infoDoc({
    name: 'Blend',
    lead: 'Changes the shape between the two ends of the knob, Transistor and Tube/Tape.',
    meta: [
      { label: 'DAW name', value: 'Blend' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '−10 … +10. −10 is labelled Transistor. +10 is labelled Tube/Tape.' },
      { label: 'Default', value: '+10' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'It is the other half of the waveshaper, with Drive. The Harmonics bars are a unit sine through the current Drive, Blend, and Asymmetry, so you can see which overtones this setting makes before you judge it in the mix.',
          },
        ],
      },
    ],
  }),

  asymmetry: infoDoc({
    name: 'Asymmetry',
    lead: 'Biases the signal into the waveshaper, so the two halves are not driven the same way.',
    meta: [
      { label: 'DAW name', value: 'Asymmetry' },
      { label: 'Parameter ID', value: '18' },
      { label: 'Range', value: '−1 … +1' },
      { label: 'Default', value: '0' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 is centred. Away from 0 the Shape curve shifts, and the bias produces even harmonics. The 2nd bar is the one to watch. Too far and the tone leans or thumps.',
          },
        ],
      },
    ],
  }),

  tone: infoDoc({
    name: 'Tone',
    lead: 'A high shelf on the added harmonics only.',
    meta: [
      { label: 'DAW name', value: 'Tone' },
      { label: 'Parameter ID', value: '19' },
      { label: 'Range', value: '−12 … +12 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Dry is not filtered. The shelf sits at the geometric centre of the band that Feed and Post still let through, so an air-band setting tilts the air and a bass setting tilts the lows. Near 0 the shelf is out. Positive brightens above that centre. Negative darkens it.',
          },
        ],
      },
    ],
  }),

  dry: infoDoc({
    name: 'Dry',
    lead: 'Sets the level of the original signal.',
    meta: [
      { label: 'DAW name', value: 'Dry' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Feed, Post, and Tone do not touch this path. It is added to Wet. At the start, Dry is 0 dB and Wet is 0 dB, so you hear the original plus whatever the shaper added.',
          },
        ],
      },
    ],
  }),

  wet: infoDoc({
    name: 'Wet',
    lead: 'Sets the level of what the shaper added.',
    meta: [
      { label: 'DAW name', value: 'Wet' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Wet is the shaped feed, after Post, minus the same feed after Post with no shaper, then Tone. You are hearing the difference, not a second copy of the dry band, so sweeping the filters does not comb against Dry.',
          },
        ],
      },
    ],
  }),

  oversample: infoDoc({
    name: 'Oversampling',
    lead: 'Runs the waveshaper at a higher rate, then comes back.',
    meta: [
      { label: 'DAW name', value: 'Oversampling' },
      { label: 'Parameter ID', value: '17' },
      { label: 'Range', value: '1× … 4×. The knob snaps to whole steps.' },
      { label: 'Default', value: '2×' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Higher rates leave less aliasing when Drive is hard, and cost more. 1× is the lightest. It does not change Dry.',
          },
        ],
      },
    ],
  }),

  pre: infoDoc({
    name: 'Feed',
    lead: 'The band that is sent into the waveshaper. Dry is not filtered.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Both slopes start at Off, and the corners sit at the ends of the range, so the whole signal is driven until you turn a slope on. Feed Listen solos that send. Post Listen wins if both listens are on.',
          },
        ],
      },
    ],
  }),

  post: infoDoc({
    name: 'Post',
    lead: 'The band kept after the waveshaper, on the wet path only.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'The same filter is applied to the shaped signal and to a clean copy of the feed. Wet is the difference, so Post decides which part of that difference you keep. Dry is not filtered. Post Listen solos Wet.',
          },
        ],
      },
    ],
  }),

  preListen: infoDoc({
    name: 'Feed Listen',
    lead: 'Lets you hear the band going into the waveshaper.',
    meta: [
      { label: 'DAW name', value: 'Pre Listen' },
      { label: 'Parameter ID', value: '15' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Left or Right silences the other side. If Post Listen is also on, you hear Post Listen instead. Bypass blocks it.',
          },
        ],
      },
    ],
  }),

  listen: infoDoc({
    name: 'Post Listen',
    lead: 'Lets you hear what Wet adds, without Dry.',
    meta: [
      { label: 'DAW name', value: 'Post Listen' },
      { label: 'Parameter ID', value: '16' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'You hear the difference after Tone, at the Wet level. Left or Right silences the other side. It wins over Feed Listen. Bypass blocks it.',
          },
        ],
      },
    ],
  }),

  presets: infoDoc({
    name: 'Presets',
    lead: 'Writes a starting point into the knobs. These are not host presets.',
    sections: [
      {
        heading: 'What they set',
        blocks: [
          {
            ul: [
              'Wide: Drive 7.5, Blend 0, Dry −60 dB, Wet +3 dB, filters off. The output is the shaper.',
              'Exciter: Drive 7.5, Blend +5, Dry 0 dB, Wet −3 dB. Feed highpass 3 kHz at 24 dB. Post highpass 5.5 kHz at 12 dB.',
              'Bass: Drive 7.5, Blend −5, Dry 0 dB, Wet +3 dB. Feed lowpass 150 Hz at 24 dB. Post lowpass 100 Hz at 12 dB.',
            ],
          },
          { p: 'All three set Oversampling to 2× and Asymmetry and Tone to 0, and they turn both listens off. Finish by ear.' },
        ],
      },
    ],
  }),

  curve: infoDoc({
    name: 'Shape',
    lead: 'Shows the waveshaper: input across, output up.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'Drive bends it. Blend changes the law. Asymmetry shifts the operating point. The soft cloud is where the feed has been. It is not a spectrum.',
          },
        ],
      },
    ],
  }),

  bars: infoDoc({
    name: 'Harmonics',
    lead: 'Shows the 2nd through 6th harmonics of a unit sine through the current shape.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'It is not a meter of the audio. It follows Drive, Blend, and Asymmetry. A tall 2nd is the even part, which Asymmetry feeds. The odd bars are the edgier part of the same test tone.',
          },
        ],
      },
    ],
  }),
} as const;

export const harmonicsFeedInfo: FrequencyRangeInfo = {
  hipass: infoDoc({
    name: 'Feed highpass',
    lead: 'Sets how much low end is kept out of the waveshaper.',
    meta: [
      { label: 'DAW name', value: 'Pre HP' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '20 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [{ p: 'Dry is not filtered. The slope has to be above Off or this corner is not in the send.' }],
      },
    ],
  }),
  lopass: infoDoc({
    name: 'Feed lowpass',
    lead: 'Sets how much top is kept out of the waveshaper.',
    meta: [
      { label: 'DAW name', value: 'Pre LP' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '20 000 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [{ p: 'Dry is not filtered. The slope has to be above Off or this corner is not in the send.' }],
      },
    ],
  }),
  hpMode: infoDoc({
    name: 'Feed highpass slope',
    lead: 'Sets how steeply the lows are taken out of the send.',
    meta: [
      { label: 'DAW name', value: 'Pre HP Mode' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Stored range', value: slope },
      { label: 'Default', value: '0 (Off)' },
    ],
  }),
  lpMode: infoDoc({
    name: 'Feed lowpass slope',
    lead: 'Sets how steeply the highs are taken out of the send.',
    meta: [
      { label: 'DAW name', value: 'Pre LP Mode' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Stored range', value: slope },
      { label: 'Default', value: '0 (Off)' },
    ],
  }),
};

export const harmonicsPostInfo: FrequencyRangeInfo = {
  hipass: infoDoc({
    name: 'Post highpass',
    lead: 'Sets how much low end is kept out of the added harmonics.',
    meta: [
      { label: 'DAW name', value: 'Post HP' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '20 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [{ p: 'The same corner is applied to the shaped signal and to the clean copy that is subtracted from it. Dry is not filtered.' }],
      },
    ],
  }),
  lopass: infoDoc({
    name: 'Post lowpass',
    lead: 'Sets how much top is kept out of the added harmonics.',
    meta: [
      { label: 'DAW name', value: 'Post LP' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '20 000 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [{ p: 'Use it to take fizz off the difference. Dry is not filtered. The slope has to be above Off.' }],
      },
    ],
  }),
  hpMode: infoDoc({
    name: 'Post highpass slope',
    lead: 'Sets how steeply the lows are taken out after the shaper.',
    meta: [
      { label: 'DAW name', value: 'Post HP Mode' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Stored range', value: slope },
      { label: 'Default', value: '0 (Off)' },
    ],
  }),
  lpMode: infoDoc({
    name: 'Post lowpass slope',
    lead: 'Sets how steeply the highs are taken out after the shaper.',
    meta: [
      { label: 'DAW name', value: 'Post LP Mode' },
      { label: 'Parameter ID', value: '14' },
      { label: 'Stored range', value: slope },
      { label: 'Default', value: '0 (Off)' },
    ],
  }),
};
