/** Hover titles for Analyzer controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const analyzerInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Turns the spectrum and the goniometer off. The audio still passes.',
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
            p: 'While it is on, the header In and Out gains are unity. Loudness and true peak keep running, so an A/B does not wipe the integrated measurement. The spectrum picture is cleared.',
          },
        ],
      },
    ],
  }),

  waterfall: infoDoc({
    name: 'Waterfall',
    lead: 'Replaces the curve chart with a scrolling waterfall.',
    meta: [
      { label: 'DAW name', value: 'Waterfall' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'Frequency runs left to right and time runs upward. The L, R, RMS, and Hold traces step aside while it is on. The L−R strip, the meters, and the goniometer stay. It is the heavier picture, so leave it off while you are reading the curves.',
          },
        ],
      },
    ],
  }),

  pause: infoDoc({
    name: 'Pause',
    lead: 'Stops the integrated loudness, the loudness range, and the measurement clock.',
    meta: [
      { label: 'DAW name', value: 'Pause' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'Momentary, short-term, and the live true-peak bars keep moving, so you can cue. The maximum true peak stays where it was until you resume or reset.',
          },
        ],
      },
    ],
  }),

  reset: infoDoc({
    name: 'Reset',
    lead: 'Clears the integrated loudness, the loudness range, the clock, and the true-peak and sample-peak maximums.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          { p: 'This button is not a parameter. The spectrum peak-hold has its own reset.' },
        ],
      },
    ],
  }),

  resetPeak: infoDoc({
    name: 'Reset Peak',
    lead: 'Clears the white peak-hold trace.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'The hold is latched. It does not decay until the next reset, so the hottest bin of the pass stays visible. Hide the line with the Hold chip if you only want it gone from the picture. This button is not a parameter.',
          },
        ],
      },
    ],
  }),

  fftSize: infoDoc({
    name: 'FFT Size',
    lead: 'Sets how finely the spectrum is split.',
    meta: [
      { label: 'DAW name', value: 'FFT Size' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Stored range', value: '0…3. The buttons send 1k 0, 2k 1, 4k 2, 8k 3.' },
      { label: 'Default', value: '2 (4k)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Larger is finer in the lows and slower to update. Smaller is snappier and coarser in the bass. 4k is the start. 8k resolves sub and bass further and costs more. Both sides are transformed. It does not change the audio.',
          },
        ],
      },
    ],
  }),

  scale: infoDoc({
    name: 'Scale',
    lead: 'Tilts the spectrum display around 1 kHz. It does not change the sound or the loudness numbers.',
    meta: [
      { label: 'DAW name', value: 'Scale' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Stored range', value: '0…2. The buttons send Lin 0, −3 dB 1, −4.5 dB 2.' },
      { label: 'Default', value: '0 (Lin)' },
    ],
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: 'Linear is raw level, so a normal mix falls toward the top. −3 dB/oct is the tilt of a typical programme. −4.5 dB/oct is the tilt of bass-heavy material. The tilted views also draw a midband corridor of ±9 dB. The L−R strip ignores the tilt.',
          },
        ],
      },
    ],
  }),

  standard: infoDoc({
    name: 'Standard',
    lead: 'Sets the loudness target and the true-peak mark the readouts compare against.',
    meta: [
      { label: 'DAW name', value: 'Standard, Target, TP Ceiling' },
      { label: 'Parameter IDs', value: 'Standard 7. Target 8. TP Ceiling 9.' },
      { label: 'What the buttons write', value: 'EBU: −23 LUFS, −1 dBTP. ATSC: −24 LUFS, −2 dBTP. −14: −14 LUFS, −1 dBTP. −16: −16 LUFS, −1 dBTP.' },
      { label: 'Default', value: '2 (−14). Target −14 LUFS. Ceiling −1 dBTP.' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The measurement itself stays ITU-R BS.1770-4. The buttons only move the two reference parameters. Target is −36 … −8 LUFS. The ceiling is −6 … 0 dBTP. You can still automate those two on their own.',
          },
        ],
      },
    ],
  }),

  curves: infoDoc({
    name: 'Spectrum',
    lead: 'Left, right, a slower body, and a latched peak, on one frequency axis.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'The chips hide any of the four. Accent is left and warn is right, each with about a 100 ms time constant. The solid neutral curve is the power of left plus right, with about a 1 second time constant. The white line is the latched peak and only clears with Reset Peak.',
          },
        ],
      },
    ],
  }),

  diff: infoDoc({
    name: 'L − R',
    lead: 'Left minus right, in dB, on the same frequency axis.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'Above the centre line the left is hotter. Below it, the right is hotter. A line on zero is a matching spectrum. This strip does not follow the tilt.',
          },
        ],
      },
    ],
  }),

  gonio: infoDoc({
    name: 'Goniometer',
    lead: 'Plots each sample as left against right.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'A vertical line is mono. A cloud that fans left and right is wider. A thin diagonal the other way is polarity trouble. This is a meter. It has no parameter.',
          },
        ],
      },
    ],
  }),

  corr: infoDoc({
    name: 'Correlation',
    lead: 'Shows how together the two sides are, from −1 to +1.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'Near +1 the sides move together and will sum in mono. Around 0 is wide. Negative means energy that can cancel in mono, especially in the lows. This is a meter. It has no parameter.',
          },
        ],
      },
    ],
  }),

  truePeak: infoDoc({
    name: 'True peak',
    lead: 'The inter-sample peak, measured at 4× as in ITU-R BS.1770.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'The bar is the latest peak. The number is the maximum since Reset. The mark on the scale is the ceiling of the selected standard. Past that mark is an over for that ceiling, even when the sample peak is still under 0 dBFS.',
          },
        ],
      },
    ],
  }),

  integrated: infoDoc({
    name: 'Loudness',
    lead: 'Integrated loudness since Reset, gated as in BS.1770.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'The small figure next to the integrated number is the offset from the selected target. Positive means louder than the target. Momentary is 400 ms and short-term is 3 seconds, and those two are not gated. Loudness range follows the short-term values and stays blank until the measurement has settled. The clock is audio time, and Pause stops it.',
          },
        ],
      },
    ],
  }),
} as const;
