/** Hover titles for Equalizer controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

/**
 * Sixteen band slots start at parameter 3. Each slot is 14 parameters:
 * Active, Type, Slope, Freq, Gain, Q, Dyn, Dyn Attack, Dyn Release,
 * Dyn Thresh, Dyn Ratio, Dyn Listen, Dyn Mode, Channel.
 * Band N is 3 + (N−1)×14 + offset.
 * Spectrum is 227. Mono is 228.
 */

const bandId = (offset: number) =>
  `Band 1 is parameter ${3 + offset}. Each next band is 14 higher.`;

export const equalizerInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Lets the signal through with no EQ, so you can compare the curve with the untouched sound.',
    meta: [
      { label: 'DAW name', value: 'Bypass' },
      { label: 'Parameter ID', value: '2' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Turn it on and every band, including a Listen solo, is out of the sound. Turn it off and the curve is back. Use that to decide whether the EQ is clarifying the part or just making it louder.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          { p: 'While it is on, the header In and Out gains are unity.' },
        ],
      },
    ],
  }),

  mono: infoDoc({
    name: 'Mono',
    lead: 'Runs every band on the left input only, and copies that result to both outputs.',
    meta: [
      { label: 'DAW name', value: 'Mono' },
      { label: 'Parameter ID', value: '228' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Use it on a mono source. The right input is ignored, and each band’s Channel choice is hidden. The bands still run. They just all hear the left.',
          },
        ],
      },
    ],
  }),

  chart: infoDoc({
    name: 'Curve',
    lead: 'Shows the sixteen bands, the curve they make together, and the spectrum behind them.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            ul: [
              'A handle is that band’s frequency and, where the type has one, its gain. Dragging it writes Freq and Gain.',
              'The curve you drag is the gain you set. A dynamic band also draws the gain the detector is applying right now.',
              'The fill is the input and the output of the EQ. Spectrum chooses the tilt. Off draws neither.',
            ],
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Click a band to open its controls. A band that is off still has a place on the chart. It does not change the sound until Active is on.',
          },
        ],
      },
    ],
  }),

  type: infoDoc({
    name: 'Type',
    lead: 'Sets the shape of this band.',
    meta: [
      { label: 'DAW name', value: 'B1 Type, and the same for B2…B16' },
      { label: 'Parameter ID', value: bandId(1) },
      {
        label: 'Stored range',
        value:
          '0…5. The buttons send Parametric 0, Low Shelf 1, High Shelf 2, Low Pass 3, High Pass 4, Band Pass 5.',
      },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Parametric boosts or cuts a region around Freq. Q sets how wide.',
              'Low Shelf and High Shelf tilt everything below or above Freq.',
              'High Pass removes what is below Freq. Low Pass removes what is above it. Gain does not move those. Slope and Q do.',
              'Band Pass leaves a region and turns the rest down. Gain sets how loud that region is.',
            ],
          },
        ],
      },
      {
        heading: 'Where the bands start',
        blocks: [
          {
            p: 'The stored layout, before you turn a band on, is a high-pass at 30 Hz, a low shelf at 120 Hz, peaking bands from 60 Hz up to 5 kHz, a high shelf at 5 kHz, and a low-pass at 10 kHz. Active itself starts off.',
          },
        ],
      },
    ],
  }),

  slope: infoDoc({
    name: 'Slope',
    lead: 'Sets how steep a high-pass or low-pass is.',
    meta: [
      { label: 'DAW name', value: 'B1 Slope, and the same for B2…B16' },
      { label: 'Parameter ID', value: bandId(2) },
      { label: 'Range', value: '12, 24, 36, or 48 dB/oct' },
      { label: 'Default', value: '12 dB/oct. Band 1 and band 16 start at 36.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Gentler leaves more of the neighbouring sound in. Steeper removes it more completely, and the turn at Freq is sharper. These bands are filters in series. They are not crossovers that have to add back flat, so 36 dB/oct is a real choice here. Shelves, bells, and band-pass do not use this control.',
          },
        ],
      },
    ],
  }),

  freq: infoDoc({
    name: 'Freq',
    lead: 'Sets where this band works.',
    meta: [
      { label: 'DAW name', value: 'B1 Freq, and the same for B2…B16' },
      { label: 'Parameter ID', value: bandId(3) },
      { label: 'Range', value: '20 … 20 000 Hz' },
    ],
    sections: [
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'On a bell or a band-pass it is the centre. On a shelf or a pass filter it is the corner. Sweep it while the band is turned up a little, find the note you mean, then set the gain. The starting points are 30 Hz, 120 Hz, then peaking centres from 60 Hz through 5 kHz, a shelf at 5 kHz, and a low-pass at 10 kHz.',
          },
        ],
      },
    ],
  }),

  gain: infoDoc({
    name: 'Gain',
    lead: 'Sets how many decibels this band boosts or cuts.',
    meta: [
      { label: 'DAW name', value: 'B1 Gain, and the same for B2…B16' },
      { label: 'Parameter ID', value: bandId(4) },
      { label: 'Range', value: '−36 … +36 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Up adds that region. Down takes it away. A wide, small move changes the tone. A narrow, deep cut takes out a ring. High-pass and low-pass ignore this. Their job is Slope and Freq.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Dynamic EQ, when the type uses gain, adds its reduction on top of this number. The result can only go down from the gain you set. It does not add extra boost when the band gets quiet.',
          },
        ],
      },
    ],
  }),

  q: infoDoc({
    name: 'Q',
    lead: 'Sets how wide the band is, or how much a pass filter rings at the corner.',
    meta: [
      { label: 'DAW name', value: 'B1 Q, and the same for B2…B16' },
      { label: 'Parameter ID', value: bandId(5) },
      { label: 'Range', value: '0.1 … 30' },
      {
        label: 'Default',
        value: '0.71 on the shelves and the pass filters. 1.0 on the peaking bands. Two decimal places, so 0.707 reads 0.71.',
      },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A low Q on a bell or a shelf is wide and gentle. A high Q is narrow. On a high-pass or low-pass, Q is the resonance at the corner: higher rings more. The dynamic detector on a bell or a band-pass uses this same Q. A shelf’s detector uses 0.71 regardless.',
          },
        ],
      },
    ],
  }),

  active: infoDoc({
    name: 'Active',
    lead: 'Puts this band into the sound. Off, the band is stored and silent.',
    meta: [
      { label: 'DAW name', value: 'B1 Active, and the same for B2…B16' },
      { label: 'Parameter ID', value: bandId(0) },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'The number on the button is the band. Turn it off to hear the rest of the curve without this one. The frequency and the type stay where you left them.',
          },
        ],
      },
    ],
  }),

  channel: infoDoc({
    name: 'Channel',
    lead: 'Chooses which part of the stereo signal this band filters.',
    meta: [
      { label: 'DAW name', value: 'B1 Channel, and the same for B2…B16' },
      { label: 'Parameter ID', value: bandId(13) },
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
              'Stereo filters both sides.',
              'Left or Right filters that side and leaves the other alone.',
              'Mid filters the centre and leaves the wide part alone.',
              'Side filters the wide part and leaves the centre alone.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Mid and Side are encoded, filtered, and decoded in this band. The stripe on the band shows the choice. Header Mono hides this and runs everything on the left. Dynamic EQ on Stereo follows the louder side, and both sides of the band get that same gain change.',
          },
        ],
      },
    ],
  }),

  dyn: infoDoc({
    name: 'Dyn',
    lead: 'Lets the level in this region pull the band’s gain down from the amount you set.',
    meta: [
      { label: 'DAW name', value: 'B1 Dyn, and the same for B2…B16' },
      { label: 'Parameter ID', value: bandId(6) },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A boost gets smaller when that region gets loud, and returns to the gain you set when it gets quiet. A cut gets deeper when the region gets loud. It does not add boost on the quiet parts. High-pass and low-pass keep the controls, but the gain does not move until the type is one that uses gain.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The detector follows the type. A bell or a band-pass listens through a band-pass at this Q. A low shelf listens through a low-pass at 0.71. A high shelf listens through a high-pass at 0.71. The knee is fixed at 6 dB, centred on the threshold, so reduction can begin 3 dB early. There is no program-dependent release on this detector.',
          },
        ],
      },
    ],
  }),

  dynAttack: infoDoc({
    name: 'Attack',
    lead: 'Sets how quickly the dynamic gain starts moving once the region crosses the threshold.',
    meta: [
      { label: 'DAW name', value: 'B1 Dyn Attack, and the same for B2…B16' },
      { label: 'Parameter ID', value: bandId(7) },
      { label: 'Range', value: '0.1 … 500' },
      { label: 'Default', value: '20' },
      { label: 'Display', value: 'No unit: this is not a clock time in milliseconds.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A lower number catches the start of the loud note and pulls the boost down, or the cut deeper, right away. A higher number lets that start through at the gain you set, then follows. Double the number and the reaction is about twice as slow.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Same speed scale as the Compressor. About a quarter of the number is the time constant in milliseconds. In Peak and RMS this eases the gain. In Opto it eases the measured level.',
          },
        ],
      },
    ],
  }),

  dynRelease: infoDoc({
    name: 'Release',
    lead: 'Sets how quickly the band returns to the gain you set after the region falls.',
    meta: [
      { label: 'DAW name', value: 'B1 Dyn Release, and the same for B2…B16' },
      { label: 'Parameter ID', value: bandId(8) },
      { label: 'Range', value: '1 … 2000' },
      { label: 'Default', value: '200' },
      { label: 'Display', value: 'Whole numbers. No unit: this is not a clock time in milliseconds.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A lower number lets the boost return quickly, and you can hear the region pump. A higher number keeps the reduction through the gap. Listen to the phrase between the loud notes.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Same translation as Attack: about a quarter of the number is the time constant in milliseconds.',
          },
        ],
      },
    ],
  }),

  dynThresh: infoDoc({
    name: 'Threshold',
    lead: 'Sets how loud this region has to get before the dynamic gain starts moving.',
    meta: [
      { label: 'DAW name', value: 'B1 Dyn Thresh, and the same for B2…B16' },
      { label: 'Parameter ID', value: bandId(9) },
      { label: 'Range', value: '−60 … 0 dB' },
      { label: 'Default', value: '−36 dB' },
    ],
    sections: [
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Listen to the detector. Lower the threshold until the gain moves on the notes you want tamed, and sits still in the gaps. If the quiet parts of the region are pulled down too, you have gone past the notes. The knee is 6 dB wide and centred here, so a little reduction can start 3 dB under the line.',
          },
        ],
      },
    ],
  }),

  dynRatio: infoDoc({
    name: 'Ratio',
    lead: 'Sets how far the dynamic gain moves once the region is over the threshold.',
    meta: [
      { label: 'DAW name', value: 'B1 Dyn Ratio, and the same for B2…B16' },
      { label: 'Parameter ID', value: bandId(10) },
      { label: 'Range', value: '1 … 20, shown as n:1' },
      { label: 'Default', value: '2:1' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '1:1 does not move the gain. Higher numbers pull a boost down further, or a cut deeper, for the same overshoot. The result is still added to the Gain you set. It is not a separate compressor on the whole track.',
          },
        ],
      },
    ],
  }),

  dynMode: infoDoc({
    name: 'Mode',
    lead: 'Sets how this band’s detector takes hold.',
    meta: [
      { label: 'DAW name', value: 'B1 Dyn Mode, and the same for B2…B16' },
      { label: 'Parameter ID', value: bandId(12) },
      { label: 'Stored range', value: '0…2. The buttons send Peak 0, RMS 1, Opto 2.' },
      { label: 'Default', value: '0 (Peak)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Peak follows the instant level in the region. A spike moves the gain.',
              'RMS follows a short average, so the body of the note moves the gain more than one click.',
              'Opto eases off once the region is already reducing. It is a generic behaviour, not a copy of a particular optical compressor.',
            ],
          },
        ],
      },
    ],
  }),

  listen: infoDoc({
    name: 'Listen',
    lead: 'Lets you hear this band’s detector instead of the EQ.',
    meta: [
      { label: 'DAW name', value: 'B1 Dyn Listen, and the same for B2…B16' },
      { label: 'Parameter ID', value: bandId(11) },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The signal the threshold is compared with. The EQ curve is not in that solo. Only one band is heard. If more than one Listen is on, the lowest band number wins. The band button uses the warning colour while this is on. Global Bypass blocks it.',
          },
        ],
      },
    ],
  }),

  spectrum: infoDoc({
    name: 'Spectrum',
    lead: 'Tilts the analyzer drawn behind the curve. It does not change the sound.',
    meta: [
      { label: 'DAW name', value: 'Spectrum' },
      { label: 'Parameter ID', value: '227' },
      {
        label: 'Stored range',
        value: '0…3. The buttons send Off 0, Lin 1, −3 dB 2, −4.5 dB 3.',
      },
      { label: 'Default', value: '0 (Off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Off draws no analyzer. Lin is the raw level. −3 dB per octave and −4.5 dB per octave lift the picture toward the top, pivoted at 1 kHz. You see the input of the EQ and the output, after the bands and before the header Out gain.',
          },
        ],
      },
    ],
  }),
} as const;
