/** Hover titles for Denoiser controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const denoiserInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Lets the signal through without noise reduction, so you can compare the cleaned sound with the original.',
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
            p: 'Turn it on and you hear the part without the filter. Turn it off and the reduction is back. Use that to decide whether the cut is removing the bed, or whether it is also taking air and detail you wanted to keep.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'The reported latency stays. What you hear is the input delayed by one FFT, the same delay the wet path uses.',
              'While it is on, the header In and Out gains are unity.',
              'A short fade leaves the filtered sound. Coming back fades onto the filter again while the overlap refills.',
              'Diff Listen and profile Listen keep the filter running. Bypass does not replace those solos.',
            ],
          },
        ],
      },
    ],
  }),

  mono: infoDoc({
    name: 'Mono',
    lead: 'Runs the filter on the left input only and copies that result to both outputs.',
    meta: [
      { label: 'DAW name', value: 'Mono' },
      { label: 'Parameter ID', value: '15' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Turn it on when the source is mono. The right input is ignored, so a silent right side cannot pull the spectrum down. Off keeps both sides, with one shared gain.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'On uses one analysis and one resynthesis. Off uses two. The host channel count is not the cue — pick this yourself.',
          },
        ],
      },
    ],
  }),

  diffListen: infoDoc({
    name: 'Diff Listen',
    lead: 'Solos what Denoiser is removing: the delayed input minus the filtered output.',
    meta: [
      { label: 'DAW name', value: 'Diff Listen' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'You want hiss, hum, fan, tape, and room. You do not want the body of the voice, the bass, or the instrument. If the solo sounds like the dry take, the filter is eating the part.',
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Solo, then ease Amount, raise Floor toward 0 dB, or narrow Low and High until the solo is mostly the bed. It is exclusive with a profile Listen: turning this on clears a slot Listen, and the other way around.',
          },
        ],
      },
    ],
  }),

  spectrum: infoDoc({
    name: 'Spectrum',
    lead: 'Tilts the analyzer and the profile lines so a flat bed is easier to read. It does not change the sound.',
    meta: [
      { label: 'DAW name', value: 'Spectrum' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Stored range', value: '0…2. The buttons send Linear 0, −3 dB/oct 1, −4.5 dB/oct 2.' },
      { label: 'Default', value: '1 (−3 dB/oct)' },
    ],
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: 'The tilt pivots at 1 kHz. Linear is raw level. −3 and −4.5 dB/oct lift the lows on screen the way a pink-ish view does, so midrange noise sits more level against the white reduction line.',
          },
        ],
      },
    ],
  }),

  profile: infoDoc({
    name: 'Profile',
    lead: 'Chooses which of the three learned noise fingerprints the filter follows.',
    meta: [
      { label: 'DAW name', value: 'Profile' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Range', value: '1 … 3' },
      { label: 'Default', value: '1' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Learn a quiet bed into a slot, then leave Profile on that slot. Switch slots when the noise itself changes, for example a different room or a different take. Blend is how long the change takes.',
          },
        ],
      },
    ],
  }),

  blend: infoDoc({
    name: 'Blend',
    lead: 'Sets how long the filter takes to move from one noise fingerprint to another.',
    meta: [
      { label: 'DAW name', value: 'Blend' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '10 … 5000 ms' },
      { label: 'Default', value: '250 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Short can click when the two fingerprints differ a lot. Long eases the subtract so the tone does not pump as the target changes. The same time is used after a new Learn lands on the slot you are already using.',
          },
        ],
      },
    ],
  }),

  detect: infoDoc({
    name: 'Detect',
    lead: 'Chooses whether one hop or a short average of the level decides when a bin opens.',
    meta: [
      { label: 'DAW name', value: 'Detect' },
      { label: 'Parameter ID', value: '18' },
      { label: 'Stored value', value: '0…1. The buttons send Peak 0 and RMS 1.' },
      { label: 'Default', value: '0 (Peak)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            ul: [
              'Peak uses the level of this hop. A bin that only just clears the floor can open and shut from one hop to the next. That is the quick response, and the chart moves with it.',
              'RMS follows about 40 ms of that level before Span and Offset run. Around the floor the cut sits stiller, and a short hit opens a little later. A tone that is already well above the floor barely changes.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The average is on the bin power, not on the gain. Learn still stores the raw hops, so the fingerprint does not depend on this switch. The 40 ms is fixed.',
          },
        ],
      },
    ],
  }),

  amount: infoDoc({
    name: 'Amount',
    lead: 'Scales how deep the cut goes, from none to the full reduction the rest of the controls ask for.',
    meta: [
      { label: 'DAW name', value: 'Amount' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '0 … 1. The knob shows 0 … 100.' },
      { label: 'Default', value: '1' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Full applies the whole cut inside Low and High. Lower leaves more of the quiet detail in the source. Zero is no reduction.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The cut in dB is multiplied by Amount, and again by the Low/High wall. At full Amount, on the raised floor, the cut is Floor. The soft chart line is −6 dB before this scale, so below full Amount that spot is a milder cut.',
          },
        ],
      },
    ],
  }),

  octave: infoDoc({
    name: 'Octave',
    lead: 'Lets a loud bin open its neighbours, so a tone keeps its width instead of only the centre bin.',
    meta: [
      { label: 'DAW name', value: 'Octave' },
      { label: 'Parameter ID', value: '19' },
      { label: 'Range', value: '0 … 1 octave. The knob travel is logarithmic, so values near 1 take little of the turn.' },
      { label: 'Default', value: '0' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Zero is the bin on its own. A small fraction, around 1/8 to 1/4, brings the shoulders of a note along. Toward 1/2 and 1 the window gets wide: one strong partial can open the noise between it and the next.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'The shape is a raised cosine on the octave axis. In the middle the neighbour counts fully. At the octave you set, the weight is zero.',
              'A neighbour can only raise the level the filter sees. It cannot pull a loud bin down.',
              'Gain reduction on the chart follows that wider opening. The solid line stays the fingerprint.',
            ],
          },
        ],
      },
    ],
  }),

  floor: infoDoc({
    name: 'Floor',
    lead: 'Sets the deepest gain the filter is allowed to reach when a bin is at or under the noise floor.',
    meta: [
      { label: 'DAW name', value: 'Floor' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '−60 … 0 dB' },
      { label: 'Default', value: '−20 dB' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Closer to 0 leaves more noise and is safer on a voice. Closer to −60 allows a deep cut when Amount is high, and is more likely to sound hollow when the filter is wrong. −20 dB leaves about a tenth of the bin.',
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'If Diff Listen starts chewing air or the tail of a note, move Floor toward 0. The solid chart line is the level where this full cut begins. Span and Offset move that line. Floor does not.',
          },
        ],
      },
    ],
  }),

  span: infoDoc({
    name: 'Span',
    lead: 'Sets how far a bin must rise above the raised noise floor before the cut has opened to −6 dB.',
    meta: [
      { label: 'DAW name', value: 'Span' },
      { label: 'Parameter ID', value: '16' },
      { label: 'Range', value: '3 … 24 dB' },
      { label: 'Default', value: '12 dB' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'On the solid line the cut is at Floor. One Span higher, the gain is −6 dB when Amount is full. At 3 dB that point sits just over the solid line, so a hit that barely clears the bed still comes through. At 24 dB the same −6 dB point is a full 24 dB above the solid line.',
          },
        ],
      },
      {
        heading: 'How to read the chart',
        blocks: [
          {
            p: 'The soft line is that −6 dB point. Span moves only the soft line. Offset moves both lines together. Use Span when the bed gets a little louder than the capture without changing shape, and you still want the filter to open once the part is clearly above it.',
          },
        ],
      },
    ],
  }),

  offset: infoDoc({
    name: 'Offset',
    lead: 'Lifts the learned noise floor by the same amount in every bin before the filter decides what is noise.',
    meta: [
      { label: 'DAW name', value: 'Offset' },
      { label: 'Parameter ID', value: '17' },
      { label: 'Range', value: '0 … 24 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Zero leaves the fingerprint where you captured it. Higher treats everything within that many dB of the fingerprint as noise, so the full Floor cut holds until the signal clears the lift. The stored fingerprint does not change, and the mini charts stay on the capture.',
          },
        ],
      },
      {
        heading: 'How to read the chart',
        blocks: [
          {
            p: 'The solid line is the fingerprint plus Offset. That is the floor the filter uses. The soft line stays Span dB above it. Both move when you turn Offset.',
          },
        ],
      },
    ],
  }),

  fLo: infoDoc({
    name: 'Low',
    lead: 'Sets the low edge of the band the filter is allowed to cut. Below it, the reduction falls away.',
    meta: [
      { label: 'DAW name', value: 'Low' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '20 … 20000 Hz' },
      { label: 'Default', value: '20 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Raise it to keep rumble, kick, and chest out of the subtract. Lower it when the problem is under the current edge, such as hum or tape rumble. The same edge is the left handle on the chart. Low Slope sets how fast the wall falls. Off on that slope leaves the bottom open.',
          },
        ],
      },
    ],
  }),

  fLoSlope: infoDoc({
    name: 'Low Slope',
    lead: 'Sets how steeply the reduction returns to zero below the low edge.',
    meta: [
      { label: 'DAW name', value: 'Low Slope' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Stored range', value: '0…4. Off 0, then 12, 24, 36, 48 dB/oct.' },
      { label: 'Default', value: '2 (24 dB/oct)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Off leaves the lows in the subtract all the way down. A steeper slope reaches the full cut sooner above the handle and lets go sooner below it. The white reduction line follows that same wall back to 0 dB.',
          },
        ],
      },
    ],
  }),

  fHi: infoDoc({
    name: 'High',
    lead: 'Sets the high edge of the band the filter is allowed to cut. Above it, the reduction falls away.',
    meta: [
      { label: 'DAW name', value: 'High' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Range', value: '20 … 20000 Hz' },
      { label: 'Default', value: '160 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Cap it so air and brightness outside the noise band are left alone. Open it when the bed is broadband hiss. The same edge is the right handle on the chart. High Slope sets the fall. Off on that slope leaves the top open.',
          },
        ],
      },
    ],
  }),

  fHiSlope: infoDoc({
    name: 'High Slope',
    lead: 'Sets how steeply the reduction returns to zero above the high edge.',
    meta: [
      { label: 'DAW name', value: 'High Slope' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Stored range', value: '0…4. Off 0, then 12, 24, 36, 48 dB/oct.' },
      { label: 'Default', value: '2 (24 dB/oct)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Off leaves the top of the band in the subtract. A steeper slope keeps the full cut closer to the handle and returns to no cut sooner above it. The white reduction line follows that roll-off.',
          },
        ],
      },
    ],
  }),

  quality: infoDoc({
    name: 'Quality',
    lead: 'Sets the FFT length, which is both the frequency detail and the latency.',
    meta: [
      { label: 'DAW name', value: 'Quality' },
      { label: 'Parameter ID', value: '11' },
      {
        label: 'Stored range',
        value: '0…3. Fast 0 (1024), Normal 1 (2048), Studio 2 (4096), Ultra 3 (8192).',
      },
      { label: 'Default', value: '1 (Normal, 2048)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Fast is snappier and coarser in the low end, and it costs the least delay. Ultra splits the lows most finely and costs the most delay and CPU. The latency is one FFT: 1024, 2048, 4096, or 8192 samples.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'A fingerprint learned at another size keeps working. It is resampled onto the new grid. The next Learn on that slot starts fresh and, when you release it, replaces the fingerprint. The chart and the filter use the same FFT.',
          },
        ],
      },
    ],
  }),

  learn: infoDoc({
    name: 'Learn',
    lead: 'Averages the incoming spectrum into this slot for as long as the button stays on.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Feed a quiet bed: room, pre-roll, fan, tape, not the performance. Turn it off to freeze the fingerprint. While Quality stays put, a second pass on the same slot continues that average and the button reads Add. Change Quality and the next capture starts fresh: the button reads Learn again, and releasing it replaces the fingerprint.',
          },
          {
            p: 'The previous curve keeps working until that new capture is stored. Clear first if you want a fresh capture without changing Quality. Only one slot learns at a time.',
          },
        ],
      },
    ],
  }),

  listen: infoDoc({
    name: 'Listen',
    lead: 'Solos this slot’s learned noise as the sound you hear, so you can check the fingerprint.',
    meta: [
      { label: 'DAW name', value: 'Listen' },
      { label: 'Parameter ID', value: '14' },
      { label: 'Stored range', value: '0…3. Off is 0. The three cards send slots 1, 2, and 3.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'You should hear the bed you meant to capture, not the music. It is exclusive with Diff Listen and with the other slots: only one listen is on at a time.',
          },
        ],
      },
    ],
  }),

  clear: infoDoc({
    name: 'Clear',
    lead: 'Wipes this slot’s learned noise fingerprint.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Confirm on the second click. The mini chart empties at once. If this was the active Profile, the subtract loses that target. Learn a new bed, or switch Profile to another slot that still has one.',
          },
        ],
      },
    ],
  }),

  selectCard: infoDoc({
    name: 'Profile card',
    lead: 'Makes this slot the fingerprint the filter follows, and shows what was learned into it.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: 'Highlighted means Profile matches this card. The mini chart is the stored fingerprint, not the live input. An empty card stays flat until you Learn. The same choice is the Profile knob.',
          },
        ],
      },
    ],
  }),
} as const;
