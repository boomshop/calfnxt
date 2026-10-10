/** Hover titles for Tamer controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const tamerInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Turns the cuts off. The latency stays, so the timing does not jump.',
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
          { p: 'While it is on, the header In and Out gains are unity. Diff Listen does not solo the residue.' },
        ],
      },
    ],
  }),

  channel: infoDoc({
    name: 'Channel',
    lead: 'Chooses which part of the stereo signal is searched and cut.',
    meta: [
      { label: 'DAW name', value: 'Channel' },
      { label: 'Parameter ID', value: '18' },
      { label: 'Stored range', value: '0…4. The buttons send Stereo 0, Left 1, Right 2, Mid 3, Side 4.' },
      { label: 'Default', value: '0 (Stereo)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Stereo links both sides.',
              'Left or Right cuts that side. The other stays latency-matched and dry.',
              'Mid cuts the centre. Side cuts the wide part.',
            ],
          },
          { p: 'Diff Listen solos what was removed on the path you chose.' },
        ],
      },
    ],
  }),

  depth: infoDoc({
    name: 'Depth',
    lead: 'Sets how deep a detected resonance may be cut.',
    meta: [
      { label: 'DAW name', value: 'Depth' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Range', value: '0 … 24 dB' },
      { label: 'Default', value: '6 dB' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Once a tip clears Threshold, the cut eases toward this ceiling. The first bit over the threshold does not jump straight to the full depth. Past about 12 dB the climb gets steeper, so the same excess reaches the ceiling sooner. Diff Listen should be the ring, not the body of the note.',
          },
        ],
      },
    ],
  }),

  sharpness: infoDoc({
    name: 'Sharpness',
    lead: 'Sets how wide each cut is, in octaves.',
    meta: [
      { label: 'DAW name', value: 'Sharpness' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Range', value: '1/24 … 1/2 octave. Stored as about 0.042 … 0.5.' },
      { label: 'Default', value: '1/12 octave' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'Narrow keeps the cut on the tip. Wide dips a whole band. Too wide thins the neighbours. Too narrow can miss a resonance that moves between notes.' },
        ],
      },
    ],
  }),

  threshold: infoDoc({
    name: 'Threshold',
    lead: 'Sets how far a tip must stick out from its neighbours before Depth starts cutting.',
    meta: [
      { label: 'DAW name', value: 'Threshold' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Range', value: '0 … 24 dB' },
      { label: 'Default', value: '6 dB' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Higher waits for a clearer whistle. Lower starts sooner and is more willing to chew a formant. The same margin decides when one peak in a harmonic ladder is loud enough to still be cut.',
          },
        ],
      },
    ],
  }),

  harmonics: infoDoc({
    name: 'Harmonics',
    lead: 'Protects a clean pitched series so Depth does not eat the tone.',
    meta: [
      { label: 'DAW name', value: 'Harmonics' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '0 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The detector walks clear tips from low to high. From a free tip it looks for more near 2×, 3×, and 4×. Three in a row count as a tone, and those frequencies are kept more as this control rises. A peak that sticks out from its own ladder by more than Threshold is still cut. While the external sidechain is on, this protection is off.',
          },
        ],
      },
    ],
  }),

  attack: infoDoc({
    name: 'Attack',
    lead: 'Sets how quickly a cut locks onto a new resonance.',
    meta: [
      { label: 'DAW name', value: 'Attack' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Range', value: '0.1 … 500 ms' },
      { label: 'Default', value: '5 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'These are real milliseconds, applied per analysis hop. Faster catches a short whistle. Too fast can flutter on a consonant or a pick.' },
        ],
      },
    ],
  }),

  release: infoDoc({
    name: 'Release',
    lead: 'Sets how long a cut holds after the peak falls.',
    meta: [
      { label: 'DAW name', value: 'Release' },
      { label: 'Parameter ID', value: '14' },
      { label: 'Range', value: '1 … 2 000 ms' },
      { label: 'Default', value: '80 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'These are real milliseconds. The 1s mark on the scale is one second. Short follows a moving ring. Long can leave a hole after the whistle is gone.' },
        ],
      },
    ],
  }),

  fLo: infoDoc({
    name: 'Search Low',
    lead: 'The low edge of the band the detector looks at. The left handle on the chart.',
    meta: [
      { label: 'DAW name', value: 'Search Low' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '200 Hz' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Depth follows this filter. The cut is full in the passband and fades out down the skirt. A gentler slope still lets some action below the handle. Raise it to leave rumble and chest alone.',
          },
        ],
      },
    ],
  }),

  fHi: infoDoc({
    name: 'Search High',
    lead: 'The high edge of the band the detector looks at. The right handle on the chart.',
    meta: [
      { label: 'DAW name', value: 'Search High' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '5 000 Hz' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          { p: 'Cap it so air and hiss above the problem never drive the detector. A gentler slope widens the skirt above the handle.' },
        ],
      },
    ],
  }),

  hpSlope: infoDoc({
    name: 'HP Slope',
    lead: 'Sets how steeply the search ignores everything below Search Low.',
    meta: [
      { label: 'DAW name', value: 'HP Slope' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Stored range', value: '0…4. The buttons send 6 dB 0, 12 dB 1, 24 dB 2, 36 dB 3, 48 dB 4.' },
      { label: 'Default', value: '2 (24 dB)' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [
          { p: 'This shapes detection and how deep a bin may be cut. It is not a wet/dry blend. Steeper is a harder wall under the handle.' },
        ],
      },
    ],
  }),

  lpSlope: infoDoc({
    name: 'LP Slope',
    lead: 'Sets how steeply the search ignores everything above Search High.',
    meta: [
      { label: 'DAW name', value: 'LP Slope' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Stored range', value: '0…4. The buttons send 6 dB 0, 12 dB 1, 24 dB 2, 36 dB 3, 48 dB 4.' },
      { label: 'Default', value: '2 (24 dB)' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [{ p: 'Steeper keeps the detector off the air above the handle. Gentler leaves a wider skirt.' }],
      },
    ],
  }),

  quality: infoDoc({
    name: 'Quality',
    lead: 'Sets the analysis size for the chart and the cuts, and with it the latency.',
    meta: [
      { label: 'DAW name', value: 'Quality' },
      { label: 'Parameter ID', value: '15' },
      { label: 'Stored range', value: '0…3. The buttons send Fast 0, Normal 1, Studio 2, Ultra 3.' },
      { label: 'Default', value: '1 (Normal)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Fast is 1 024 points. Normal is 2 048. Studio is 4 096. Ultra is 8 192. Larger resolves lower rings and costs more latency. Changing it can make the host re-compensate.',
          },
        ],
      },
    ],
  }),

  spectrum: infoDoc({
    name: 'Spectrum',
    lead: 'Tilts the analyzer. It does not change the sound.',
    meta: [
      { label: 'DAW name', value: 'Spectrum' },
      { label: 'Parameter ID', value: '16' },
      { label: 'Stored range', value: '0…2. The buttons send Linear 0, −3 dB/oct 1, −4.5 dB/oct 2.' },
      { label: 'Default', value: '1 (−3 dB/oct)' },
    ],
    sections: [
      {
        heading: 'How to read it',
        blocks: [{ p: 'The tilt is pivoted at 1 kHz. Linear is raw level. The other two flatten a typical or a bass-heavy spectrum so a ring is easier to see.' }],
      },
    ],
  }),

  sidechainActive: infoDoc({
    name: 'Sidechain',
    lead: 'Lets the sidechain bus drive the detector instead of the track.',
    meta: [
      { label: 'DAW name', value: 'Sidechain' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The detector hears the mid of the sidechain. Search, Threshold, Depth, Sharpness, and the times still apply. Harmonics protection is off. If nothing is routed, detection falls back to the track. The chart keeps the track and draws the sidechain as a thin line.',
          },
        ],
      },
    ],
  }),

  scListen: infoDoc({
    name: 'SC Listen',
    lead: 'Lets you hear the sidechain the detector is using.',
    meta: [
      { label: 'DAW name', value: 'SC Listen' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          { p: 'It is the latency-matched mid of the sidechain, not the residue of the cut. That residue is Diff Listen. It is only useful while Sidechain is on.' },
        ],
      },
    ],
  }),

  diffListen: infoDoc({
    name: 'Diff Listen',
    lead: 'Lets you hear what was removed.',
    meta: [
      { label: 'DAW name', value: 'Diff Listen' },
      { label: 'Parameter ID', value: '17' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'You hear the latency-matched difference, dry minus the tamed signal, on the path Channel selected. You want the ring. If you hear the body of the note, back off Depth, raise Threshold, narrow Sharpness, or raise Harmonics. While Bypass is on there is no cut, so this solo is empty. If SC Listen is also on, you hear the sidechain instead.',
          },
        ],
      },
    ],
  }),
} as const;
