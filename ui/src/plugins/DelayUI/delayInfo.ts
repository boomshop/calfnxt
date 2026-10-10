/** Hover titles for Delay controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';
import type { FrequencyRangeInfo } from '../../widgets/FrequencyRange/frequencyRangeInfo';

export const delayInfo = {
  active: infoDoc({
    name: 'Active',
    lead: 'Lets new notes into the delay. Off, the echoes already in the line can still fade, and the dry signal stays.',
    meta: [
      { label: 'DAW name', value: 'Active' },
      { label: 'Parameter ID', value: '2' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '1 (on)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Turn it off at the end of a phrase when you want the trail to finish and nothing new to enter. Dry is still the level you set. There is no separate bypass. The header In and Out gains always apply.',
          },
        ],
      },
    ],
  }),

  mixMode: infoDoc({
    name: 'Mix Mode',
    lead: 'Chooses how the left and right delays are wired.',
    meta: [
      { label: 'DAW name', value: 'Mix Mode' },
      { label: 'Parameter ID', value: '13' },
      {
        label: 'Stored range',
        value: '0…3. The buttons send Stereo 0, Ping-Pong 1, L then R 2, R then L 3.',
      },
      { label: 'Default', value: '1 (Ping-Pong)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Stereo runs two delays. Each side repeats itself. The two times are balanced so the trails fade together: a longer side feeds back a little more per repeat. When the times match, Feedback is used as you set it.',
              'Ping-Pong swaps sides on each repeat. Feedback is the knob as you set it.',
              'L then R plays the left delay, then feeds that into the right at the sum of the two times. The second echo is a little quieter, so the cascade does not get louder than the first.',
              'R then L is the same cascade starting on the right.',
            ],
          },
        ],
      },
    ],
  }),

  subdiv: infoDoc({
    name: 'Subdivide',
    lead: 'Sets how many equal steps fit in one beat. Time L and Time R count those steps.',
    meta: [
      { label: 'DAW name', value: 'Subdivide' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '1 … 16, whole numbers' },
      { label: 'Default', value: '4' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'At 1, one step is a whole beat. At 4, a beat is split in four, so Time 1 is a quarter of a beat. Higher numbers make every step shorter. At 120 BPM and 4, one step is 125 ms. The longest line is about 11 seconds at 48 kHz. A setting past that is shortened.',
          },
        ],
      },
    ],
  }),

  timeL: infoDoc({
    name: 'Time L',
    lead: 'Sets how many steps the left echo waits.',
    meta: [
      { label: 'DAW name', value: 'Time L' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '1 … 16, whole numbers' },
      { label: 'Default', value: '3' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'At the defaults, 120 BPM and Subdivide 4, 3 is 375 ms. Match Time R for an even stereo repeat. Offset them when you want the sides to answer each other. In L then R and R then L the second echo lands at the sum of the two times.',
          },
        ],
      },
    ],
  }),

  timeR: infoDoc({
    name: 'Time R',
    lead: 'Sets how many steps the right echo waits.',
    meta: [
      { label: 'DAW name', value: 'Time R' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Range', value: '1 … 16, whole numbers' },
      { label: 'Default', value: '5' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'At the defaults that is 625 ms. The same rules as Time L. In Stereo, changing either time also retunes how Feedback is shared, so both trails still fade together.',
          },
        ],
      },
    ],
  }),

  sync: infoDoc({
    name: 'Sync',
    lead: 'Uses the host tempo for the beat, when the host is sending one.',
    meta: [
      { label: 'DAW name', value: 'Sync' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'On, and the host tempo is valid, the delays follow the session. BPM, Beat ms, and Tap are locked. If the host is not sending a tempo, the stored BPM is used. Off, the delay uses the BPM you set.',
          },
        ],
      },
    ],
  }),

  tempo: infoDoc({
    name: 'BPM',
    lead: 'Sets the tempo the steps are counted against.',
    meta: [
      { label: 'DAW name', value: 'BPM' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '30 … 300 BPM' },
      { label: 'Default', value: '120' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'This is the clock the delay actually uses, unless Sync has a host tempo. Beat ms is the same tempo written as the length of one beat: 60 000 divided by the BPM. Moving either one writes the other. At 120, one beat is 500 ms.',
          },
        ],
      },
    ],
  }),

  beatMs: infoDoc({
    name: 'Beat ms',
    lead: 'The length of one beat, in milliseconds. It is the same tempo as BPM.',
    meta: [
      { label: 'DAW name', value: 'ms' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '10 … 2000 ms' },
      { label: 'Default', value: '500 ms' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'These are real milliseconds. Move it when you think in time rather than in BPM. The delay still counts steps from the BPM that this writes. Locked while Sync is following the host.',
          },
        ],
      },
    ],
  }),

  tap: infoDoc({
    name: 'Tap',
    lead: 'Sets BPM from the gaps between your taps.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Tap several times. The tempo is 60 000 divided by the average gap, kept inside 30 to 300 BPM. It writes BPM, and Beat ms follows. It does nothing while Sync is locked to the host. This button is not a parameter.',
          },
        ],
      },
    ],
  }),

  feedback: infoDoc({
    name: 'Feedback',
    lead: 'Sets how much of each echo is sent back for the next one.',
    meta: [
      { label: 'DAW name', value: 'Feedback' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '50 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 you get one echo. Higher keeps the trail going. Near 100 % the line can build until it howls. The feedback filter is what keeps a long trail from getting duller or brighter on every repeat. In Stereo the knob is shared so both sides fade together. In the cascades, the second echo is already a little quieter than this number alone.',
          },
        ],
      },
    ],
  }),

  width: infoDoc({
    name: 'Width',
    lead: 'Spreads or swaps the wet echoes. It does not change the dry signal.',
    meta: [
      { label: 'DAW name', value: 'Width' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Range', value: '−1 … +1' },
      { label: 'Default', value: '+1' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At +1 you hear the wiring of Mix Mode as it is. At 0 the wet signal is mono. At −1 the two wet sides are swapped. The dry signal stays where it was. A wide ping-pong can collapse when the mix is summed to mono, because the swapped repeats meet in the middle.',
          },
        ],
      },
    ],
  }),

  dry: infoDoc({
    name: 'Dry',
    lead: 'Sets the level of the signal that is not delayed.',
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
          {
            p: 'This is added to the wet echoes. It is not delayed. Turn it down when the repeats should be the sound. Leave it up when the delay sits behind a clear note. It is separate from the header In and Out gains.',
          },
        ],
      },
    ],
  }),

  wet: infoDoc({
    name: 'Wet',
    lead: 'Sets the level of the echoes.',
    meta: [
      { label: 'DAW name', value: 'Wet' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '−12 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'This is the first echo. Feedback decides how the later ones fall away from it. At the default the repeats sit 12 dB under a dry signal at 0 dB. Turning Wet to −60 does not clear a trail that is already in the line. Feedback still drains it.',
          },
        ],
      },
    ],
  }),
} as const;

export const delayFeedbackInfo: FrequencyRangeInfo = {
  hipass: infoDoc({
    name: 'Highpass',
    lead: 'Sets how much low end is taken out of each repeat on the way into the line.',
    meta: [
      { label: 'DAW name', value: 'HP Freq' },
      { label: 'Parameter ID', value: '14' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '80 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'The dry signal is not filtered. The first echo already passes through this, and every further repeat passes through it again. Raise it when a long trail gets muddy. The slope has to be above Off or this corner is not in the line.',
          },
        ],
      },
    ],
  }),
  lopass: infoDoc({
    name: 'Lowpass',
    lead: 'Sets how much top is taken out of each repeat on the way into the line.',
    meta: [
      { label: 'DAW name', value: 'LP Freq' },
      { label: 'Parameter ID', value: '15' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '8 000 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Lower it when the repeats get hissy or harsh as they pile up. The default slope is 24 dB/oct, so this corner is already in the sound. The dry signal is not filtered.',
          },
        ],
      },
    ],
  }),
  hpMode: infoDoc({
    name: 'Highpass slope',
    lead: 'Sets how steep that high-pass is. Off means the lows stay in the repeats.',
    meta: [
      { label: 'DAW name', value: 'HP Mode' },
      { label: 'Parameter ID', value: '16' },
      { label: 'Stored range', value: '0…4. The buttons send Off, 12, 24, 36, 48 dB/oct.' },
      { label: 'Default', value: '0 (Off)' },
    ],
  }),
  lpMode: infoDoc({
    name: 'Lowpass slope',
    lead: 'Sets how steep that low-pass is. Off means the top stays in the repeats.',
    meta: [
      { label: 'DAW name', value: 'LP Mode' },
      { label: 'Parameter ID', value: '17' },
      { label: 'Stored range', value: '0…4. The buttons send Off, 12, 24, 36, 48 dB/oct.' },
      { label: 'Default', value: '2 (24 dB/oct)' },
    ],
  }),
};
