/** Hover titles for Impulse controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';
import type { FrequencyRangeInfo } from '../../widgets/FrequencyRange/frequencyRangeInfo';

const slope =
  'The buttons send Off 0, 12 dB 1, 24 dB 2, 48 dB 4.';

export const impulseInfo = {
  active: infoDoc({
    name: 'Active',
    lead: 'Turns the convolution on. Off, you hear the dry signal, delayed by the same hop as the room.',
    meta: [
      { label: 'DAW name', value: 'Bypass' },
      { label: 'Parameter ID', value: '2' },
      { label: 'Stored value', value: 'The button is lit when convolution is on. The host stores Bypass: 0 is on, 1 is off.' },
      { label: 'Default', value: 'On (Bypass 0)' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Off, the convolver is not run. The Dry and Wet knobs are not in that path: you hear the latency-matched input, and the header In and Out gains are unity. The loaded file stays. Turning it back on brings the room in without reloading. The reported latency stays at 512 samples while an impulse is loaded.',
          },
        ],
      },
    ],
  }),

  source: infoDoc({
    name: 'Source',
    lead: 'Chooses what is sent into the impulse. The dry path stays the original stereo.',
    meta: [
      { label: 'DAW name', value: 'Source' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Stored range', value: '0…3. The buttons send Stereo 0, Left 1, Right 2, L+R 3.' },
      { label: 'Default', value: '0 (Stereo)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Stereo feeds left and right on their own. A four-channel file uses all four paths.',
              'Left or Right feeds that side into both inputs of the room.',
              'L+R feeds the average of the two sides into both inputs, so a centred source is not doubled.',
            ],
          },
        ],
      },
    ],
  }),

  quality: infoDoc({
    name: 'Quality',
    lead: 'Chooses how much of the impulse’s stereo wiring is actually convolved.',
    meta: [
      { label: 'DAW name', value: 'Quality' },
      { label: 'Parameter ID', value: '14' },
      { label: 'Stored range', value: '0…2. The buttons send Lo 0, Mid 1, Hi 2.' },
      { label: 'Default', value: '2 (Hi)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            ul: [
              'Lo collapses the file to one channel. A stereo file becomes the average of left and right. A four-channel file becomes the average of the two direct paths.',
              'Mid keeps a stereo left/right pair. A four-channel file keeps the direct paths and drops the wrap from left into right and right into left.',
              'Hi keeps the file as captured, including all four paths of a true-stereo hall.',
            ],
          },
          {
            p: 'Changing it rebuilds the engine and crossfades. The hop stays 512 samples. A file that is already mono does not get cheaper on Lo.',
          },
        ],
      },
    ],
  }),

  decay: infoDoc({
    name: 'Decay',
    lead: 'Shortens the captured tail. 100 % is the impulse as it was loaded.',
    meta: [
      { label: 'DAW name', value: 'Decay' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Range', value: '15 … 100 %. Stored as 0.15…1.' },
      { label: 'Default', value: '100 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Below 100 % a fade is applied and the tail is cut. The room dies earlier. It does not invent length past the file. The handle on the waveform is this same control. Loading another file sets it back to 100 % and turns Reverse off. Shape is how that extra fade falls.',
          },
        ],
      },
    ],
  }),

  shape: infoDoc({
    name: 'Shape',
    lead: 'Sets how the extra Decay fade falls, from the start of the impulse to the cut.',
    meta: [
      { label: 'DAW name', value: 'Shape' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Range', value: '1 … 8' },
      { label: 'Default', value: '4' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 100 % Decay there is no fade, so this does nothing. 1 is a straight drop in level. Higher values stay louder for longer and then fall harder. 8 hangs and then drops. Changing it rebuilds the engine the same way Decay does.',
          },
        ],
      },
    ],
  }),

  predelay: infoDoc({
    name: 'Predelay',
    lead: 'Adds silence in front of the wet impulse, after the convolver’s own hop.',
    meta: [
      { label: 'DAW name', value: 'Predelay' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '0 … 500 ms' },
      { label: 'Default', value: '0 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'These are real milliseconds. The dry path is already delayed by the 512-sample hop so the blend does not comb at the start. This knob only pushes the wet later. The waveform on the chart starts at this time, and the axis always includes 500 ms of room past the impulse.',
          },
        ],
      },
    ],
  }),

  reverse: infoDoc({
    name: 'Reverse',
    lead: 'Plays the impulse backwards.',
    meta: [
      { label: 'DAW name', value: 'Reverse' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Decay shortens the file first, then the clip is reversed, so the handle is the same cut. The engine crossfades. Choosing another file turns this off.',
          },
        ],
      },
    ],
  }),

  dry: infoDoc({
    name: 'Dry',
    lead: 'Sets the level of the latency-matched dry path while the convolution is on.',
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
          {
            p: 'On an insert, leave it near 0 and set Wet under it. On a send, where the mixer already has the dry, pull this down. It is not in the path while Active is off.',
          },
        ],
      },
    ],
  }),

  amount: infoDoc({
    name: 'Wet',
    lead: 'Sets the level of the convolved room.',
    meta: [
      { label: 'DAW name', value: 'Wet' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '−12 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Files are peak-normalized to about −6 dBFS on load, so switching files does not jump to full scale. This knob is the trim after that. The wet filter is on this path.',
          },
        ],
      },
    ],
  }),

  library: infoDoc({
    name: 'Library',
    lead: 'Chooses the folder of impulse responses. One click loads a file.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'The scan is recursive and reads WAV and uncompressed AIFF. Open folders and the scroll position are stored in the session. Rescan after you add files. The loaded impulse is stored in the session even if the file later moves. Select… and Rescan are not parameters.',
          },
        ],
      },
    ],
  }),

  filter: infoDoc({
    name: 'Filter',
    lead: 'Narrows the tree by filename.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'The match is case-insensitive and looks at the name only. A folder stays if a file inside it matches. This box is not a parameter.',
          },
        ],
      },
    ],
  }),

  chart: infoDoc({
    name: 'Waveform',
    lead: 'Shows the loaded impulse, the Decay cut, and the Predelay.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'The vertical handle is Decay. At 100 % there is no fade overlay. Shape draws how that fade falls. The trace starts after Predelay, and the axis always includes 500 ms past the file. Dragging the handle writes Decay.',
          },
        ],
      },
    ],
  }),
} as const;

export const impulseFilterInfo: FrequencyRangeInfo = {
  hipass: infoDoc({
    name: 'Highpass',
    lead: 'Sets how much low end is taken out of the room.',
    meta: [
      { label: 'DAW name', value: 'HP Freq' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '60 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [{ p: 'Dry is not filtered. The slope has to be above Off or this corner is not in the room. The default slope is 24 dB/oct, so this corner is already in the sound.' }],
      },
    ],
  }),
  lopass: infoDoc({
    name: 'Lowpass',
    lead: 'Sets how much top is taken out of the room.',
    meta: [
      { label: 'DAW name', value: 'LP Freq' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '10 000 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [{ p: 'Dry is not filtered. The slope starts at Off, so this corner does nothing until you turn the lowpass on.' }],
      },
    ],
  }),
  hpMode: infoDoc({
    name: 'Highpass slope',
    lead: 'Sets how steeply the lows are taken out of the room.',
    meta: [
      { label: 'DAW name', value: 'HP Mode' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Stored range', value: slope },
      { label: 'Default', value: '2 (24 dB)' },
    ],
  }),
  lpMode: infoDoc({
    name: 'Lowpass slope',
    lead: 'Sets how steeply the highs are taken out of the room.',
    meta: [
      { label: 'DAW name', value: 'LP Mode' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Stored range', value: slope },
      { label: 'Default', value: '0 (Off)' },
    ],
  }),
};
