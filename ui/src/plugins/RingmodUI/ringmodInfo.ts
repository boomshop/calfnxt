/** Hover titles for Ring Modulator controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

const wave =
  '0…4. The buttons send Sine 0, Triangle 1, Square 2, Saw up 3, Saw down 4.';

export const ringmodInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Lets the signal through with no ring modulation.',
    meta: [
      { label: 'DAW name', value: 'Bypass' },
      { label: 'Parameter ID', value: '2' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [{ p: 'While it is on, the header In and Out gains are unity. Listen does not solo the carrier.' }],
      },
    ],
  }),

  channel: infoDoc({
    name: 'Channel',
    lead: 'Chooses which part of the stereo signal is multiplied by the carrier.',
    meta: [
      { label: 'DAW name', value: 'Channel' },
      { label: 'Parameter ID', value: '28' },
      { label: 'Stored range', value: '0…4. The buttons send Stereo 0, Left 1, Right 2, Mid 3, Side 4.' },
      { label: 'Default', value: '0 (Stereo)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Stereo multiplies both sides. Phase and Detune are the difference between the two carriers.',
              'Left or Right multiplies that side. The other stays dry.',
              'Mid multiplies the centre. Side multiplies the wide part. Each uses one carrier.',
            ],
          },
        ],
      },
    ],
  }),

  modMode: infoDoc({
    name: 'Waveform',
    lead: 'Sets the shape of the carrier that multiplies the signal.',
    meta: [
      { label: 'DAW name', value: 'Waveform' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Stored range', value: wave },
      { label: 'Default', value: '0 (Sine)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Sine is the plain metallic product. Triangle is softer. Square is harsher. The saws lean the sidebands one way or the other. Listen solos the carrier so you can hear the shape before Amount brings the input back.',
          },
        ],
      },
    ],
  }),

  modFreq: infoDoc({
    name: 'Frequency',
    lead: 'Sets the carrier pitch, unless LFO 1 is sweeping it.',
    meta: [
      { label: 'DAW name', value: 'Frequency' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '1 … 20 000 Hz' },
      { label: 'Default', value: '1 000 Hz' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Low is a slow gurgle. Around 1 kHz is the classic metallic ring. High thins the sidebands. While LFO 1 → Freq is on, this knob is parked and the sweep uses Min and Max instead.',
          },
        ],
      },
    ],
  }),

  modAmount: infoDoc({
    name: 'Amount',
    lead: 'Blends the multiplied signal with the dry one. 100 % is fully the ring.',
    meta: [
      { label: 'DAW name', value: 'Amount' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '50 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The dry part is the input times one minus this amount. The wet part is the input times the carrier times this amount. The blend is linear, on the path Channel selected. While LFO 2 → Amount is on, this knob is replaced by that range.',
          },
        ],
      },
    ],
  }),

  modPhase: infoDoc({
    name: 'Phase',
    lead: 'Offsets the right carrier against the left.',
    meta: [
      { label: 'DAW name', value: 'Phase' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '0 … 1, a full turn of the carrier' },
      { label: 'Default', value: '0.5' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 puts the carriers together. 0.5, the default, puts them opposite, which widens the ring. Mid and Side use one carrier, so this offset is not that path.',
          },
        ],
      },
    ],
  }),

  modDetune: infoDoc({
    name: 'Detune',
    lead: 'Splits the two carriers in cents. Left goes up, right goes down.',
    meta: [
      { label: 'DAW name', value: 'Detune' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '−200 … +200 ct' },
      { label: 'Default', value: '0 ct' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A few cents is a slow beat between the sides. More is two obvious pitches. While LFO 1 → Detune is on, this knob is replaced by that range.',
          },
        ],
      },
    ],
  }),

  modListen: infoDoc({
    name: 'Listen',
    lead: 'Lets you hear the carrier, without the input.',
    meta: [
      { label: 'DAW name', value: 'Listen' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          { p: 'Tune Frequency, Waveform, Detune, and Phase here, then turn it off and set Amount. Bypass blocks it.' },
        ],
      },
    ],
  }),

  modFreqLin: infoDoc({
    name: 'Freq scale',
    lead: 'Chooses whether a frequency sweep moves in octaves or in hertz.',
    meta: [
      { label: 'DAW name', value: 'Freq Lin' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Stored value', value: '0…1. Lin at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (Log)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Log, the start, spends equal time per octave. Lin moves in equal hertz, so it crawls near the top of the range and rushes through the bottom. The same law is used for LFO 1 → Frequency and for LFO 2 sweeping LFO 1’s rate.',
          },
        ],
      },
    ],
  }),

  lfo1Mode: infoDoc({
    name: 'LFO 1 wave',
    lead: 'Sets the shape of the first modulator.',
    meta: [
      { label: 'DAW name', value: 'LFO 1 Wave' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Stored range', value: wave },
      { label: 'Default', value: '0 (Sine)' },
    ],
  }),

  lfo1Freq: infoDoc({
    name: 'LFO 1 rate',
    lead: 'Sets how fast LFO 1 moves, unless LFO 2 is sweeping that rate.',
    meta: [
      { label: 'DAW name', value: 'LFO 1 Frequency' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Range', value: '0.01 … 10 Hz' },
      { label: 'Default', value: '0.1 Hz' },
    ],
  }),

  lfo1Reset: infoDoc({
    name: 'LFO 1 reset',
    lead: 'Puts LFO 1 back to the start of its cycle.',
    meta: [
      { label: 'DAW name', value: 'LFO 1 Reset' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Stored value', value: '0…1. The button writes a reset.' },
      { label: 'Default', value: '0' },
    ],
  }),

  lfo1ModFreq: infoDoc({
    name: 'LFO 1 → Frequency',
    lead: 'Lets LFO 1 sweep the carrier between Min and Max.',
    meta: [
      { label: 'DAW name', value: 'LFO1→Freq, Min, Max' },
      { label: 'Parameter IDs', value: 'Active 15. Min 13. Max 14.' },
      { label: 'Range', value: 'Each end is 1 … 20 000 Hz.' },
      { label: 'Defaults', value: 'On. Min 200 Hz. Max 4 000 Hz.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'While it is on, the Frequency knob is not the carrier. The sweep uses Log or Lin. Turn it off and the carrier sits on the Frequency knob again.',
          },
        ],
      },
    ],
  }),

  lfo1ModDetune: infoDoc({
    name: 'LFO 1 → Detune',
    lead: 'Lets LFO 1 sweep the stereo detune between Min and Max.',
    meta: [
      { label: 'DAW name', value: 'LFO1→Detune, Min, Max' },
      { label: 'Parameter IDs', value: 'Active 18. Min 16. Max 17.' },
      { label: 'Range', value: 'Each end is −200 … +200 ct.' },
      { label: 'Defaults', value: 'Off. Min −100 ct. Max +100 ct.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'While it is on, the Detune knob is replaced by this range. Frequency is a separate sweep.' },
        ],
      },
    ],
  }),

  lfo2Mode: infoDoc({
    name: 'LFO 2 wave',
    lead: 'Sets the shape of the second modulator.',
    meta: [
      { label: 'DAW name', value: 'LFO 2 Wave' },
      { label: 'Parameter ID', value: '19' },
      { label: 'Stored range', value: wave },
      { label: 'Default', value: '0 (Sine)' },
    ],
  }),

  lfo2Freq: infoDoc({
    name: 'LFO 2 rate',
    lead: 'Sets how fast LFO 2 moves.',
    meta: [
      { label: 'DAW name', value: 'LFO 2 Frequency' },
      { label: 'Parameter ID', value: '20' },
      { label: 'Range', value: '0.01 … 10 Hz' },
      { label: 'Default', value: '0.2 Hz' },
    ],
  }),

  lfo2Reset: infoDoc({
    name: 'LFO 2 reset',
    lead: 'Puts LFO 2 back to the start of its cycle.',
    meta: [
      { label: 'DAW name', value: 'LFO 2 Reset' },
      { label: 'Parameter ID', value: '21' },
      { label: 'Stored value', value: '0…1. The button writes a reset.' },
      { label: 'Default', value: '0' },
    ],
  }),

  lfo2Lfo1Freq: infoDoc({
    name: 'LFO 2 → LFO 1',
    lead: 'Lets LFO 2 sweep the rate of LFO 1 between Min and Max.',
    meta: [
      { label: 'DAW name', value: 'LFO2→LFO1, Min, Max' },
      { label: 'Parameter IDs', value: 'Active 24. Min 22. Max 23.' },
      { label: 'Range', value: 'Each end is 0.01 … 10 Hz.' },
      { label: 'Defaults', value: 'Off. Min 0.05 Hz. Max 0.5 Hz.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'While it is on, the LFO 1 rate knob is replaced by this range. The sweep uses the same Log or Lin law as the carrier frequency.' },
        ],
      },
    ],
  }),

  lfo2ModAmount: infoDoc({
    name: 'LFO 2 → Amount',
    lead: 'Lets LFO 2 sweep Amount between Min and Max.',
    meta: [
      { label: 'DAW name', value: 'LFO2→Amount, Min, Max' },
      { label: 'Parameter IDs', value: 'Active 27. Min 25. Max 26.' },
      { label: 'Range', value: 'Each end is 0 … 100 %.' },
      { label: 'Defaults', value: 'Off. Min 30 %. Max 60 %.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'While it is on, the Amount knob is replaced by this range, so the ring breathes against the dry signal.' },
        ],
      },
    ],
  }),

  spectrum: infoDoc({
    name: 'Spectrum',
    lead: 'Tilts the analyzer. It does not change the sound.',
    meta: [
      { label: 'DAW name', value: 'Spectrum' },
      { label: 'Parameter ID', value: '29' },
      { label: 'Stored range', value: '0…3. The buttons send Off 0, Lin 1, −3 dB 2, −4.5 dB 3.' },
      { label: 'Default', value: '1 (Lin)' },
    ],
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: 'You see the input and the output. The ring adds sidebands and takes energy out of the original pitch. There is usually no peak sitting on the carrier itself.',
          },
        ],
      },
    ],
  }),
} as const;
