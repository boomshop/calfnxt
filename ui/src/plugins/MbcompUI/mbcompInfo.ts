/** Hover titles for Multiband Compressor controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

/**
 * Six band slots start at parameter 10. Each slot is 13 parameters:
 * Active, Bypass, Listen, Threshold, Ratio, Knee, Attack, Release,
 * Makeup, Mix, Mode, Link, PDR. Band N is 10 + (N−1)×13 + offset.
 * DAW names are "B1 Threshold" and so on.
 * Threshold defaults: B1 −18, B2 −20, B3 −22, B4 −24, B5 −20, B6 −18 dB.
 * The other band parameters share one default.
 */

const bandId = (offset: number) =>
  `Band 1 is parameter ${10 + offset}. Each next band is 13 higher.`;

export const mbcompInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Lets the signal through with no band compression, so you can compare the processed sound with the untouched one.',
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
            p: 'Turn it on and the crossovers stop changing the level. You hear the input again. Turn it off and every band’s compression is back. Use that to decide whether the split is helping, or whether the phrase just got flatter.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'While it is on, the header In and Out gains are unity.',
              'Each band’s GR meter sits at 0. The histories still show the band levels, with no reduction.',
              'Listen does not solo a band while this is on.',
              'Mono still copies the left input to both outputs.',
            ],
          },
        ],
      },
    ],
  }),

  channel: infoDoc({
    name: 'Channel',
    lead: 'Chooses which part of the stereo signal is split and compressed. The same choice is what each band listens to.',
    meta: [
      { label: 'DAW name', value: 'Channel' },
      { label: 'Parameter ID', value: '89' },
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
              'Stereo splits and compresses both sides. Each band’s Link decides whether the louder side, the average, or the centre sets that one gain. Both sides of the band receive it.',
              'Left or Right compresses that side only. The other side is kept in step with the crossovers and is not compressed.',
              'Mid compresses the centre. The wide part stays uncompressed, still in step with the split.',
              'Side compresses the wide part. The centre stays uncompressed.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The untreated part is not left as a raw copy. It passes through the same crossover so the picture does not notch where the bands meet. This control is hidden while Mono is on, because Mono already uses only the left input.',
          },
        ],
      },
    ],
  }),

  mono: infoDoc({
    name: 'Mono',
    lead: 'Runs the split and the compressors on the left input only, and copies that result to both outputs.',
    meta: [
      { label: 'DAW name', value: 'Mono' },
      { label: 'Parameter ID', value: '88' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Use it on a mono source. The right input is ignored. You get one set of bands instead of two, which is less work. Channel is hidden, because there is no stereo picture left to choose.',
          },
        ],
      },
    ],
  }),

  numBands: infoDoc({
    name: 'Bands',
    lead: 'Sets how many bands the signal is split into, from 2 to 6.',
    meta: [
      { label: 'DAW name', value: 'Bands' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Range', value: '2 … 6' },
      { label: 'Default', value: '4' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Fewer bands means each compressor looks after a wider slice. More bands means you can hold the low end without also holding the voice, or the voice without the air. The extra bands are extra crossovers. With nothing compressing, they still add back without notches. Once a band is compressing, that balance is exactly what you are changing.',
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'The − and + buttons change the count. Adding a band puts the new crossover on the geometric midpoint between the previous top split and 20 kHz, so the new top band starts in the middle of what used to be the top. You can drag it after that. Bands above the count stay stored. They do not run.',
          },
        ],
      },
    ],
  }),

  slope: infoDoc({
    name: 'Slope',
    lead: 'Sets how steep every crossover is.',
    meta: [
      { label: 'DAW name', value: 'Slope' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Stored range', value: 'The buttons send 24, 48, or 96 dB/oct.' },
      { label: 'Default', value: '48 dB/oct' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Steeper means less of the neighbouring band leaks into the one you are compressing. A kick stays in the low band. Gentler means the bands share more of the spectrum, so compressing one still touches its neighbour. The joins stay flat when the gains are unity. There is no 12 or 36.',
          },
        ],
      },
    ],
  }),

  scale: infoDoc({
    name: 'Scale',
    lead: 'Tilts the spectrum drawn behind the bands. It does not change the sound.',
    meta: [
      { label: 'DAW name', value: 'Scale' },
      { label: 'Parameter ID', value: '90' },
      { label: 'Stored range', value: '0…2. The buttons send Lin 0, −3 dB 1, −4.5 dB 2.' },
      { label: 'Default', value: '0 (Lin)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Lin is the raw level. The top of a mix usually looks quieter than the bottom. −3 dB per octave and −4.5 dB per octave lift the display toward the top, pivoted at 1 kHz, so a band that looks hot is hot relative to that tilt. The compressors do not hear this tilt.',
          },
        ],
      },
    ],
  }),

  xover: infoDoc({
    name: 'Crossover',
    lead: 'Sets the frequency where one band hands over to the next.',
    meta: [
      { label: 'DAW names', value: 'Xover 1 … Xover 5' },
      { label: 'Parameter IDs', value: '5, 6, 7, 8, 9' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Defaults', value: '200, 800, 3 200, 8 000, 12 000 Hz' },
    ],
    sections: [
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Drag the vertical handle on the chart, or think about where one job ends and the next starts. Only the crossovers inside the current band count are in the sound. If a kick and a voice are in the same band and you wanted different compression, move the split until Listen on each side is a different instrument.',
          },
        ],
      },
    ],
  }),

  chart: infoDoc({
    name: 'Bands',
    lead: 'Shows each band’s slice, how far that slice is being turned down, and the spectrum behind it.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            ul: [
              'Each curve is that band’s crossover, shifted by its gain reduction.',
              'The vertical handles are the crossovers. The handle in a band is that band’s threshold, sitting at the geometric middle of the band.',
              'The filled spectrum is the input and the output. Scale tilts that picture only.',
            ],
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Click a band to select it. Drag a crossover when two jobs are sharing a band. Drag a threshold when that slice should start being held. Listen is still the way to hear whether the slice is the instrument you meant.',
          },
        ],
      },
    ],
  }),

  bandSelect: infoDoc({
    name: 'Band',
    lead: 'Selects this band for the detail controls. Selecting it does not change the sound.',
  }),

  bandActive: infoDoc({
    name: 'Active',
    lead: 'Stored for older sessions. The audio ignores it. Bypass is what takes the compressor off this band.',
    meta: [
      { label: 'DAW name', value: 'B1 Active, and the same for B2…B6' },
      { label: 'Parameter ID', value: bandId(0) },
      { label: 'Default', value: '1 (on)' },
    ],
  }),

  bandBypass: infoDoc({
    name: 'Bypass',
    lead: 'Takes the compressor off this band. The band stays in the sum, uncompressed.',
    meta: [
      { label: 'DAW name', value: 'B1 Bypass, and the same for B2…B6' },
      { label: 'Parameter ID', value: bandId(1) },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Turn it on and that slice is back to the level the crossover gave it, including its makeup and mix coming out over a short fade. The rest of the bands keep working. Use it to hear whether this band was helping. The GR meter for the band sits at 0 when the fade has finished. The detector keeps running, so turning it off does not start from silence.',
          },
        ],
      },
    ],
  }),

  bandListen: infoDoc({
    name: 'Listen',
    lead: 'Lets you hear only this band, after its crossover and its compression.',
    meta: [
      { label: 'DAW name', value: 'B1 Listen, and the same for B2…B6' },
      { label: 'Parameter ID', value: bandId(2) },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The slice this band is working on, including makeup and mix. The other bands are not in the solo. Only one band can be in Listen. Turning another on turns this one off. While it is on, nothing else in the mix masks the threshold and the attack.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Global Bypass blocks the solo. On Side, the solo is the wide image, left and inverted right. The untreated stereo half is not mixed back in.',
          },
        ],
      },
    ],
  }),

  threshold: infoDoc({
    name: 'Threshold',
    lead: 'Sets how loud this band has to get before it is turned down.',
    meta: [
      { label: 'DAW name', value: 'B1 Threshold, and the same for B2…B6' },
      { label: 'Parameter ID', value: bandId(3) },
      { label: 'Range', value: '−60 … 0 dB' },
      {
        label: 'Defaults',
        value: 'B1 −18, B2 −20, B3 −22, B4 −24, B5 −20, B6 −18 dB',
      },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Lower it and more of this slice is held. The band gets denser. Raise it and only the louder moments in the slice move GR. The other bands are not this threshold.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Listen to the band. Lower the threshold until GR moves on the notes you want held, and sits at 0 in the gaps you want left alone. If the gaps in this slice are pulled down too, you have gone past the notes. That even level can still be what you want for this band. Mix puts the uncompressed slice back beside it.',
          },
        ],
      },
      {
        heading: 'On the graph',
        blocks: [
          {
            p: 'The handle in the band sits on this level. The band history draws it as a dashed line. With Knee above 0, reduction can begin a little before the line. The transfer handle for the selected band is the same level.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Same law as the Compressor. The knee is centred on this level. At the default Knee of 6 dB the margin is 3 dB on either side. Ratio at 1:1 does not turn the band down.',
          },
        ],
      },
    ],
  }),

  ratio: infoDoc({
    name: 'Ratio',
    lead: 'Sets how much of this band’s level above the threshold is turned down.',
    meta: [
      { label: 'DAW name', value: 'B1 Ratio, and the same for B2…B6' },
      { label: 'Parameter ID', value: bandId(4) },
      { label: 'Range', value: '1 … 20, shown as n:1' },
      { label: 'Default', value: '4:1' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '1:1 leaves the band alone. 4:1 means a peak 4 dB over the working part of the curve comes out about 1 dB over, in this band only. Higher numbers hold the slice flatter. The highest is 20:1, not a brick-wall limit.',
          },
        ],
      },
    ],
  }),

  mode: infoDoc({
    name: 'Mode',
    lead: 'Sets how this band takes hold: on the instant spike, on a short average, or more gently once it is already working.',
    meta: [
      { label: 'DAW name', value: 'B1 Mode, and the same for B2…B6' },
      { label: 'Parameter ID', value: bandId(10) },
      { label: 'Stored range', value: '0…2. The buttons send Peak 0, RMS 1, Opto 2.' },
      { label: 'Default', value: '1 (RMS)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Peak grabs the loudest instant in the band. A hit moves GR. The body of a note can stay loud.',
              'RMS follows a short average, so the body of the slice moves GR more than one click.',
              'Opto eases off once the band is already reducing. It is a generic behaviour, not a copy of a particular optical compressor.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Each band has its own mode. Peak and RMS ease the gain with Attack and Release. Opto eases the measured level, and a deeper reduction makes that slower. The RMS average is fixed and short. It is not the Attack knob.',
          },
        ],
      },
    ],
  }),

  link: infoDoc({
    name: 'Link',
    lead: 'Chooses which of the two sides sets this band’s gain. Both sides of the band still receive that same gain.',
    meta: [
      { label: 'DAW name', value: 'B1 Link, and the same for B2…B6' },
      { label: 'Parameter ID', value: bandId(11) },
      { label: 'Stored range', value: '0…2. The buttons send Max 0, Avg 1, Mid 2.' },
      { label: 'Default', value: '0 (Max)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Max follows the louder side of this band. A peak on the left pulls both sides of the slice down together.',
              'Avg follows the average of both sides.',
              'Mid follows only the centre of this band. A loud side does not push the gain. The side is still turned down with the centre. It is not left uncompressed.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'On Left, Right, Mid, Side, or Mono, the detector is already one signal, so the three settings behave the same. Link matters on Stereo.',
          },
        ],
      },
    ],
  }),

  attack: infoDoc({
    name: 'Attack',
    lead: 'Sets how quickly this band starts turning down once its level crosses into compression.',
    meta: [
      { label: 'DAW name', value: 'B1 Attack, and the same for B2…B6' },
      { label: 'Parameter ID', value: bandId(6) },
      { label: 'Range', value: '0.1 … 500' },
      { label: 'Default', value: '20' },
      { label: 'Display', value: 'No unit: this is not a clock time in milliseconds.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A lower number catches the start of the hit in this band. A higher number lets that start through, then pulls the sustain down. On a low band, too fast can thin the kick. On a high band, too fast can dull the click you wanted to keep. Double the number and the reaction is about twice as slow.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Same speed scale as the Compressor. About a quarter of the number is the time constant in milliseconds. In Peak and RMS this eases the gain. In Opto it eases the measured level. The transfer dot does not wait for it. The GR meter does.',
          },
        ],
      },
    ],
  }),

  release: infoDoc({
    name: 'Release',
    lead: 'Sets how quickly this band’s gain comes back after the level falls.',
    meta: [
      { label: 'DAW name', value: 'B1 Release, and the same for B2…B6' },
      { label: 'Parameter ID', value: bandId(7) },
      { label: 'Range', value: '1 … 2000' },
      { label: 'Default', value: '200' },
      { label: 'Display', value: 'Whole numbers. No unit: this is not a clock time in milliseconds.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A lower number lets the slice open again quickly, and you can hear it pump. A higher number keeps the slice held through the gap. Listen to this band and watch its GR through a gap. PDR can make a deep reduction slower than this number.',
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

  pdr: infoDoc({
    name: 'PDR',
    lead: 'Makes a deep reduction on this band let go more slowly than a light one.',
    meta: [
      { label: 'DAW name', value: 'B1 PDR, and the same for B2…B6' },
      { label: 'Parameter ID', value: bandId(12) },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '0 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 % the release is only the Release knob. Turn it up and a big hit in this band recovers more slowly than a small one. At 100 % and a deep reduction, release is about five times the Release number. It does not change Attack.',
          },
        ],
      },
    ],
  }),

  knee: infoDoc({
    name: 'Knee',
    lead: 'Rounds the point where this band starts compressing, instead of a hard corner at the threshold.',
    meta: [
      { label: 'DAW name', value: 'B1 Knee, and the same for B2…B6' },
      { label: 'Parameter ID', value: bandId(5) },
      { label: 'Range', value: '0 … 24 dB' },
      { label: 'Default', value: '6 dB' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 the band is either off or fully at the ratio. Raise it and the slice eases into compression. Some reduction is already happening before the dashed line.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The width is centred on the threshold. At 6 dB, reduction begins about 3 dB below it and the full ratio is reached about 3 dB above it.',
          },
        ],
      },
    ],
  }),

  makeup: infoDoc({
    name: 'Makeup',
    lead: 'Turns this band back up after compression, so you can judge the tone rather than which slice is quieter.',
    meta: [
      { label: 'DAW name', value: 'B1 Makeup, and the same for B2…B6' },
      { label: 'Parameter ID', value: bandId(8) },
      { label: 'Range', value: '0 … 24 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Raise it until this band’s bypass is no longer an obvious drop in level. If the peaks you just turned down are simply loud again, makeup has replaced the reduction. The band history does not include it. The band-out meter does. Mix at 0 % means you do not hear it.',
          },
        ],
      },
    ],
  }),

  mix: infoDoc({
    name: 'Mix',
    lead: 'Blends this band’s compressed signal with the uncompressed slice. 100 % is fully compressed.',
    meta: [
      { label: 'DAW name', value: 'B1 Mix, and the same for B2…B6' },
      { label: 'Parameter ID', value: bandId(9) },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '100 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Lower it and the crossover’s own slice comes back beside the compressed one. The other bands are not this mix. At 0 % this band is the split, uncompressed. The blend is linear.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The history shows the gain reduction before this blend. The band-out meter is after it.',
          },
        ],
      },
    ],
  }),

  gr: infoDoc({
    name: 'GR',
    lead: 'Shows how many decibels this band is turning down right now. It is a meter, not a control.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: '0 means this band is under its threshold, or its bypass fade has finished. A higher number means more reduction, up to 60 dB on the scale, with marks at 1, 3, 6, and 12. A number that stays up means the slice is being held through the phrase, not only on the hits.',
          },
        ],
      },
    ],
  }),

  bandIn: infoDoc({
    name: 'In',
    lead: 'Shows how loud this band is after the crossover and before compression.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: 'It is the slice the threshold is compared with, from −60 dB to 0 dB. If it never reaches the threshold, GR stays at 0 no matter the ratio. Makeup and mix are not in it.',
          },
        ],
      },
    ],
  }),

  bandOut: infoDoc({
    name: 'Out',
    lead: 'Shows this band after compression, makeup, and mix.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: 'Compare it with In. If Out sits much lower, the band is being held and makeup has not brought it back. If Out sits higher, makeup or a quiet input is winning. The history is a different picture: it leaves makeup and mix out, so you can still see the reduction alone.',
          },
        ],
      },
    ],
  }),

  history: infoDoc({
    name: 'History',
    lead: 'Shows the last 4 seconds of this band’s level, and how far it is being turned down.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            ul: [
              'One fill is the band before gain reduction. The other is the band after it. Makeup and mix are not in either.',
              'The dashed line is this band’s threshold.',
              'GR, on by default, is the gain. It sits at 0 dB when nothing is reduced and moves down by the amount being turned down.',
            ],
          },
        ],
      },
    ],
  }),

  transfer: infoDoc({
    name: 'Transfer',
    lead: 'Shows this band’s working curve: how loud the band’s detector hears the slice, and the level that comes out of the curve.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'The corner is Threshold. The slope above it is Ratio. Knee rounds the corner. Makeup shifts the result up. The dot is the detector level on that curve right now, including makeup, without waiting for Attack and Release. The GR meter can still be catching up.',
          },
        ],
      },
    ],
  }),
} as const;
