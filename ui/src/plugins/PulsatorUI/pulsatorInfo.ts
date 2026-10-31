/** Hover titles for Pulsator controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const pulsatorInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Lets the signal through with no level modulation. The LFOs keep running.',
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
            p: 'While it is on, the header In and Out gains are unity and the gain sits at 1. Turning it off returns on the phase the LFOs have reached, so the pulse does not jump.',
          },
        ],
      },
    ],
  }),

  mono: infoDoc({
    name: 'Mono-in',
    lead: 'Sums left and right to mono before the two LFOs move the level.',
    meta: [
      { label: 'DAW name', value: 'Mono-in' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Use it when you want a pan of one sound rather than two sides pulsing on their own. The offsets still move the left and right gains apart.',
          },
        ],
      },
    ],
  }),

  mode: infoDoc({
    name: 'Mode',
    lead: 'Sets the shape both LFOs use.',
    meta: [
      { label: 'DAW name', value: 'Mode' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Stored range', value: '0…4. The buttons send Sine 0, Triangle 1, Square 2, Saw up 3, Saw down 4.' },
      { label: 'Default', value: '0 (Sine)' },
    ],
  }),

  amount: infoDoc({
    name: 'Modulation',
    lead: 'Sets how far the level falls on each cycle. 100 % can reach silence.',
    meta: [
      { label: 'DAW name', value: 'Modulation' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '100 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The loud part of the wave stays at unity. The quiet part sits at one minus this amount. At 100 % the trough is silence. At 50 % the trough is half level. It does not turn the peak up. At 0 the LFOs still run and the gain stays at 1.',
          },
        ],
      },
    ],
  }),

  pulseWidth: infoDoc({
    name: 'Pulse Width',
    lead: 'Sets how much of each LFO cycle is the pulse.',
    meta: [
      { label: 'DAW name', value: 'Pulse Width' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Stored range', value: '0…4. The buttons send ⅛, ¼, ½, 1, 2.' },
      { label: 'Default', value: '3 (1)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '1 uses the whole cycle. Narrower fractions shorten the pulse inside that same tempo. 2 stretches the shape across two cycles.',
          },
        ],
      },
    ],
  }),

  offsetL: infoDoc({
    name: 'Offset L',
    lead: 'Shifts where the left LFO sits in its cycle.',
    meta: [
      { label: 'DAW name', value: 'Offset L' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '0 … 100 % of the cycle' },
      { label: 'Default', value: '0 %' },
    ],
  }),

  offsetR: infoDoc({
    name: 'Offset R',
    lead: 'Shifts where the right LFO sits in its cycle.',
    meta: [
      { label: 'DAW name', value: 'Offset R' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '0 … 100 % of the cycle' },
      { label: 'Default', value: '50 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 50 % against a left offset of 0, one side is loud while the other is quiet. That is the autopanner. Match the offsets and both sides pulse together.',
          },
        ],
      },
    ],
  }),

  sync: infoDoc({
    name: 'Sync',
    lead: 'Uses the host tempo for the cycle, when the host is sending one.',
    meta: [
      { label: 'DAW name', value: 'Sync' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'On, and the host tempo is valid, one cycle is one beat of the session. BPM, Beat ms, and Tap are locked. If the host is not sending a tempo, the stored BPM is used.',
          },
        ],
      },
    ],
  }),

  tempo: infoDoc({
    name: 'BPM',
    lead: 'Sets the tempo. One LFO cycle is one beat.',
    meta: [
      { label: 'DAW name', value: 'BPM' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Range', value: '0.5 … 300 BPM' },
      { label: 'Default', value: '120' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'At 120 the cycle is 500 ms. At 0.5 the cycle is two minutes. Beat ms is the same tempo written as that period: 60 000 divided by the BPM. Moving either one writes the other. The LFO uses this BPM, unless Sync has a host tempo.',
          },
        ],
      },
    ],
  }),

  beatMs: infoDoc({
    name: 'Beat ms',
    lead: 'The length of one cycle, in milliseconds. It is the same tempo as BPM.',
    meta: [
      { label: 'DAW name', value: 'ms' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Range', value: '200 … 120 000 ms' },
      { label: 'Default', value: '500 ms' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'These are real milliseconds. The scale marks are clock time: 1s is one second, 1m is one minute. Locked while Sync is following the host.',
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
            p: 'Tap several times. The tempo follows the average gap and is kept inside the BPM range. Beat ms follows. It does nothing while Sync is locked. This button is not a parameter.',
          },
        ],
      },
    ],
  }),

  reset: infoDoc({
    name: 'Reset',
    lead: 'Puts both LFOs back to the start of the cycle, then the offsets apply.',
    meta: [
      { label: 'DAW name', value: 'Reset' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Stored value', value: '0…1. The button writes a reset.' },
      { label: 'Default', value: '0' },
    ],
  }),

  history: infoDoc({
    name: 'History',
    lead: 'Shows the last 8 seconds of the level going in and the level coming out, left and right.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'A trough in the output that the input does not have is the pulse. Bypass draws the input on both, because the gain is unity.',
          },
        ],
      },
    ],
  }),
} as const;
