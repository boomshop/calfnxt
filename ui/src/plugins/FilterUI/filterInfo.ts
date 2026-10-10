/** Hover titles for Filter controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const filterInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Lets the signal through with no filter, so you can compare the sweep with the untouched sound.',
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
          { p: 'While it is on, the header In and Out gains are unity. The cutoff sits on Frequency, or on a held MIDI note.' },
        ],
      },
    ],
  }),

  mono: infoDoc({
    name: 'Mono',
    lead: 'Runs the filter on the left input only, and copies that result to both outputs.',
    meta: [
      { label: 'DAW name', value: 'Mono' },
      { label: 'Parameter ID', value: '16' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Use it on a mono source. The right input is ignored, and Channel is hidden. The envelope listens to the left as well.',
          },
        ],
      },
    ],
  }),

  mode: infoDoc({
    name: 'Mode',
    lead: 'Sets the shape and the steepness.',
    meta: [
      { label: 'DAW name', value: 'Mode' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Stored range', value: '0…12. See the list.' },
      { label: 'Default', value: '0 (Low Pass 12)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Low Pass 12, 24, 48 removes what is above the cutoff. Steeper removes it more completely.',
              'High Pass 12, 24, 48 removes what is below it.',
              'Band Pass 6, 12, 18 leaves a region around the cutoff.',
              'Band Reject 6, 12, 18 takes that region out.',
              'Allpass keeps the level and turns the phase. On its own it is quiet as a tone change. With Mix below 100 % it colours.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The buttons send Low Pass 12/24/48 as 0/1/2, High Pass 12/24/48 as 3/4/5, Band Pass 6/12/18 as 6/7/8, Band Reject 6/12/18 as 9/10/11, and Allpass as 12. Low-pass and high-pass are the shapes whose Mix can stay flat. The others accept more coloration when dry is blended in.',
          },
        ],
      },
    ],
  }),

  channel: infoDoc({
    name: 'Channel',
    lead: 'Chooses which part of the stereo signal is filtered. The envelope listens to the same part.',
    meta: [
      { label: 'DAW name', value: 'Channel' },
      { label: 'Parameter ID', value: '17' },
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
              'Mid filters the centre. Side filters the wide part.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          { p: 'Hidden while Mono is on. The detector follows the louder of the two sides it is given.' },
        ],
      },
    ],
  }),

  resonance: infoDoc({
    name: 'Resonance',
    lead: 'Sets how much the filter emphasises the cutoff.',
    meta: [
      { label: 'DAW name', value: 'Resonance' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '0.707 … 32' },
      { label: 'Default', value: '0.707. Two decimal places, so it reads 0.71.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At the bottom the corner is smooth. Higher makes a peak at the cutoff, the classic filter ring. Very high can whistle. On a low-pass or high-pass, a high resonance also means Mix no longer stays as flat. Soft Clip rounds those peaks on the filtered path.',
          },
        ],
      },
    ],
  }),

  frequency: infoDoc({
    name: 'Frequency',
    lead: 'Sets where the filter sits when the envelope is quiet, and where it sits with the envelope off.',
    meta: [
      { label: 'DAW name', value: 'Frequency' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '10 … 20 000 Hz' },
      { label: 'Default', value: '1 000 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'With the envelope off, this is the cutoff. With it on, quiet passages sit here and loud ones move toward Target. A held MIDI note parks the cutoff on that pitch, using A as 440 Hz, until the note ends. Moving this knob clears that note so the dial is in charge again. Inertia eases the move.',
          },
        ],
      },
    ],
  }),

  inertia: infoDoc({
    name: 'Inertia',
    lead: 'Sets how long Frequency and Resonance take to catch up.',
    meta: [
      { label: 'DAW name', value: 'Inertia' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '5 … 100 ms' },
      { label: 'Default', value: '20 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'These are real milliseconds. A short time follows the knob and the envelope quickly. A long time smears the sweep, which is often what you want from an auto-wah and too slow when you are dialling a fixed cutoff by hand.',
          },
        ],
      },
    ],
  }),

  envPower: infoDoc({
    name: 'Envelope',
    lead: 'Lets the level move the cutoff between Frequency and Target.',
    meta: [
      { label: 'DAW name', value: 'Envelope' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Off, the filter stays where you put it. On, a quiet signal sits at Frequency and a loud one moves toward Target. Put Target above Frequency and the filter opens on the hits. Put it below and the filter closes on the hits.',
          },
        ],
      },
    ],
  }),

  mix: infoDoc({
    name: 'Mix',
    lead: 'Blends the filtered signal with the dry one. 100 % is fully filtered.',
    meta: [
      { label: 'DAW name', value: 'Mix' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '100 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Lower it to keep some of the original beside the filter. On a low-pass or a high-pass the dry path is the complementary opposite, so a moderate resonance still adds back without a notch. Band-pass, band-reject, allpass, and a very high resonance will colour the blend. If it sounds hollow, raise Mix or lower Resonance.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          { p: 'Soft Clip is on the filtered path only. At 0 % you do not hear it.' },
        ],
      },
    ],
  }),

  softClip: infoDoc({
    name: 'Soft Clip',
    lead: 'Rounds resonant peaks on the filtered path.',
    meta: [
      { label: 'DAW name', value: 'Soft Clip' },
      { label: 'Parameter ID', value: '14' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '0 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 the filter is linear. Raise it when a high resonance screams. The ring stays, the edges get softer. Too far dulls the attack and adds harmonics. It does not touch the dry half of Mix.',
          },
        ],
      },
    ],
  }),

  spectrum: infoDoc({
    name: 'Spectrum',
    lead: 'Tilts the analyzer drawn behind the response. It does not change the sound.',
    meta: [
      { label: 'DAW name', value: 'Spectrum' },
      { label: 'Parameter ID', value: '15' },
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
            p: 'Off draws no analyzer. Lin is the raw level. The two tilts lift the picture toward the top, pivoted at 1 kHz. You see the input and the output of the filter.',
          },
        ],
      },
    ],
  }),

  chart: infoDoc({
    name: 'Response',
    lead: 'Shows the filter curve, and the spectrum when that is on.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'The curve is the shape at the cutoff the filter is using, including a sweep and a MIDI note. Dragging the handle writes Frequency. The second handle, when the envelope is on, is Target.',
          },
        ],
      },
    ],
  }),

  target: infoDoc({
    name: 'Target',
    lead: 'Sets where the cutoff goes when the envelope is fully open.',
    meta: [
      { label: 'DAW name', value: 'Target' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Range', value: '10 … 20 000 Hz' },
      { label: 'Default', value: '4 000 Hz' },
    ],
    sections: [
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'The move is along pitch, not a straight line in hertz. Quiet sits at Frequency. Loud arrives here. Above Frequency opens on the hits. Below Frequency closes on them. You only hear it while Envelope is on.',
          },
        ],
      },
    ],
  }),

  activation: infoDoc({
    name: 'Activation',
    lead: 'Sets how loud the signal has to be before the envelope reaches Target.',
    meta: [
      { label: 'DAW name', value: 'Activation' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Range', value: '−24 … +24 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 dB a full-scale peak reaches Target. Turn it up and quieter notes already get there. Turn it down and even a full-scale peak only moves part of the way. If the filter barely moves, raise it. If it sits open on the noise, lower it.',
          },
        ],
      },
    ],
  }),

  attack: infoDoc({
    name: 'Attack',
    lead: 'Sets how quickly the envelope opens toward Target.',
    meta: [
      { label: 'DAW name', value: 'Attack' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Range', value: '0.1 … 500' },
      { label: 'Default', value: '20' },
      { label: 'Display', value: 'No unit: this is not a clock time in milliseconds.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A lower number puts the sweep on the start of the note. A higher number lets the note begin at Frequency and then move. Double the number and the opening is about twice as slow. Inertia still eases the cutoff after this.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Same speed scale as the Compressor. About a quarter of the number is the time constant in milliseconds.',
          },
        ],
      },
    ],
  }),

  release: infoDoc({
    name: 'Release',
    lead: 'Sets how quickly the envelope returns toward Frequency.',
    meta: [
      { label: 'DAW name', value: 'Release' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Range', value: '1 … 2000' },
      { label: 'Default', value: '200' },
      { label: 'Display', value: 'Whole numbers. No unit: this is not a clock time in milliseconds.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A lower number snaps the filter back after the hit. A higher number lets it bloom. If it chatters, lengthen it. Same translation as Attack: about a quarter of the number is the time constant in milliseconds.',
          },
        ],
      },
    ],
  }),

  detection: infoDoc({
    name: 'Detection',
    lead: 'Sets how the envelope measures loudness.',
    meta: [
      { label: 'DAW name', value: 'Detection' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Stored range', value: '0…2. The buttons send Peak 0, RMS 1, Opto 2.' },
      { label: 'Default', value: '2 (Opto)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Peak follows the spike. The envelope still eases with Attack and Release.',
              'RMS follows a short average, so the body of the note moves the filter more than one click.',
              'Opto eases the measured level with Attack and Release. It is a generic behaviour, not a copy of a particular optical follower. This is the starting mode.',
            ],
          },
        ],
      },
    ],
  }),
} as const;
