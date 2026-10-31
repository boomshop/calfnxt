/** Hover titles for Multiband Limiter controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

/**
 * Master parameters follow Bypass. Band slots start at 29, three each:
 * Listen, Weight, Release. Band N is 29 + (N−1)×3 + offset.
 * Mono is 47. Scale is 48.
 * Band Release defaults: B1 0.5, B2 0.2, B3 −0.2, B4 −0.5, B5 −0.66, B6 −0.75.
 */

const bandId = (offset: number) =>
  `Band 1 is parameter ${29 + offset}. Each next band is 3 higher.`;

export const mblimiterInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Lets the signal through with no limiting, so you can compare the processed sound with the untouched one.',
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
            p: 'Turn it on and the strips, the final limiter, and the color are out of the sound. The dry path is delayed to the same latency, so the comparison does not jump in time. The fade is a short equal-power crossfade.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'While it is on, the header In and Out gains are unity.',
              'Every GR meter sits at 0. Each band history draws the slice and no reduction.',
              'Mono still copies the left input to both outputs.',
            ],
          },
        ],
      },
    ],
  }),

  mono: infoDoc({
    name: 'Mono',
    lead: 'Runs the split and both limiters on the left input only, and copies that result to both outputs.',
    meta: [
      { label: 'DAW name', value: 'Mono' },
      { label: 'Parameter ID', value: '47' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Use it on a mono source. The right input is ignored, and there is only one crossover path to run.',
          },
        ],
      },
    ],
  }),

  diffListen: infoDoc({
    name: 'Diff Listen',
    lead: 'Lets you hear only what the final limiter removes.',
    meta: [
      { label: 'DAW name', value: 'Diff Listen' },
      { label: 'Parameter ID', value: '24' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The difference between the summed strips and the signal after the broadband limiter. A short tick on a hit means the final stage only caught a peak. A thick, constant residue means the ceiling is sitting on the body of the sound. The strip limiting itself is not in this solo, and neither is Color. Auto Level is in both sides, so it cancels.',
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
            p: 'Fewer bands means each strip looks after a wider slice. More bands means a kick can be held without holding the voice. With nothing limiting, the bands add back without notches. Once a strip or the final limiter is working, that balance is what you are changing.',
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'The − and + buttons change the count. Adding a band puts the new crossover on the geometric midpoint between the previous top split and 20 kHz. Bands above the count stay stored. They do not run.',
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
            p: 'Steeper means less of the neighbouring band leaks into the strip you are weighting. Gentler means the bands share more, so one strip still touches its neighbour. The joins stay flat when the gains are unity. There is no 12 or 36.',
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
      { label: 'Parameter ID', value: '48' },
      { label: 'Stored range', value: '0…2. The buttons send Lin 0, −3 dB 1, −4.5 dB 2.' },
      { label: 'Default', value: '0 (Lin)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Lin is the raw level. −3 dB per octave and −4.5 dB per octave lift the display toward the top, pivoted at 1 kHz. The limiters do not hear this tilt.',
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
            p: 'Drag the vertical handle. Only the crossovers inside the current band count are in the sound. Listen on a band tells you whether the slice is the instrument you meant. Min Release, when it is on, uses the crossover under a band as that band’s lowest frequency.',
          },
        ],
      },
    ],
  }),

  chart: infoDoc({
    name: 'Bands',
    lead: 'Shows each band’s slice, shifted by how far that slice is being turned down, and the spectrum behind it.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            ul: [
              'Each curve is that band’s crossover, shifted by its gain reduction. That reduction includes the final limiter, not only the strip.',
              'The vertical handles are the crossovers. There is no threshold handle. Weight is what moves a band’s own ceiling.',
              'The filled spectrum is the latency-matched input and the output. Scale tilts that picture only.',
            ],
          },
        ],
      },
    ],
  }),

  bandListen: infoDoc({
    name: 'Listen',
    lead: 'Lets you hear only this band, after its strip limiter.',
    meta: [
      { label: 'DAW name', value: 'B1 Listen, and the same for B2…B6' },
      { label: 'Parameter ID', value: bandId(0) },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The slice after this strip. The final limiter is still on that solo, so a ceiling you set for the whole mix is still in what you hear. Only one Listen stays on. Turning another on turns this one off.',
          },
        ],
      },
    ],
  }),

  bandWeight: infoDoc({
    name: 'Weight',
    lead: 'Moves this band’s own ceiling, and changes how hard the band pushes the reduction shared by every strip.',
    meta: [
      { label: 'DAW name', value: 'B1 Weight, and the same for B2…B6' },
      { label: 'Parameter ID', value: bandId(1) },
      { label: 'Range', value: '−1 … +1' },
      { label: 'Default', value: '0' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 this band’s ceiling is the Limit. Turn it up and the band is allowed to sit higher on its own, up to four times the ceiling at +1, about 12 dB. It also counts for more in the shared pull, so a loud moment here holds the other strips down with it. Turn it down and this band’s own ceiling drops, to a quarter at −1, about 12 dB under Limit, and it pushes the others less.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Listen to the band. If a slice is being pinned and you wanted it freer, raise Weight. If a slice is poking through the ceiling and taking the rest of the mix with it, lower Weight. The final limiter is still there either way.',
          },
        ],
      },
    ],
  }),

  bandRelease: infoDoc({
    name: 'Release',
    lead: 'Scales the master Release for this band. It is not a time of its own.',
    meta: [
      { label: 'DAW name', value: 'B1 Release, and the same for B2…B6' },
      { label: 'Parameter ID', value: bandId(2) },
      { label: 'Range', value: '−1 … +1' },
      {
        label: 'Defaults',
        value: 'B1 0.50, B2 0.20, B3 −0.20, B4 −0.50, B5 −0.66, B6 −0.75',
      },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 leaves the master time. Positive makes this strip let go more slowly. At +1 the time is four times the master Release. Negative makes it let go sooner. At −1 the time is a quarter of the master. The low bands start slower than the master, and the high bands start faster, so a kick can settle while a cymbal opens again.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The scale is the master Release in milliseconds times 0.25 raised to minus this number. Min Release can keep a band from going shorter than that result. The final limiter uses the master Release, not this offset.',
          },
        ],
      },
    ],
  }),

  bandIn: infoDoc({
    name: 'In',
    lead: 'Shows how loud this band is after Color and the crossover, before the strip limiter.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: 'It is the slice the strip is looking at, from −60 dB to 0 dB. The final limiter is not in it.',
          },
        ],
      },
    ],
  }),

  bandOut: infoDoc({
    name: 'Out',
    lead: 'Shows this band after its strip limiter, before the bands are summed and the final limiter runs.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: 'Compare it with In to see what this strip did. The GR meter beside it also includes the final limiter, so GR can move while Out still matches a strip that barely worked.',
          },
        ],
      },
    ],
  }),

  bandGr: infoDoc({
    name: 'GR',
    lead: 'Shows how many decibels this band is being turned down, by its strip and by the final limiter together.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: '0 means neither stage is reducing this slice. A higher number means more reduction, up to 60 dB on this meter, with marks at 1, 3, 6, and 12. Because the final limiter is included, every active band can show the same extra reduction when only the broadband ceiling is working.',
          },
        ],
      },
    ],
  }),

  history: infoDoc({
    name: 'History',
    lead: 'Shows the last 4 seconds of this band’s level, and how far the strip and the final limiter are turning it down.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            ul: [
              'One fill is the band before that combined gain. The other is the band after it. Auto Level is not in either.',
              'The dashed line is the Limit you set. It is not this band’s weighted ceiling.',
              'GR, on by default, is the combined gain. It sits at 0 dB when nothing is reduced.',
            ],
          },
        ],
      },
    ],
  }),

  limit: infoDoc({
    name: 'Limit',
    lead: 'Sets the ceiling for the strips and for the final limiter.',
    meta: [
      { label: 'DAW name', value: 'Limit' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Range', value: '−24 … 0 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 dB only what already reaches full scale is touched, unless a band’s Weight has lowered its own ceiling. Lower Limit and more of the phrase hits the wall. With Auto Level on, the result is turned back up so that ceiling sits at full scale again.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Watch the main GR. A short jump on a hit means a peak was caught. A number that stays up means the ceiling is on the body of the sound. Weight moves one band’s own ceiling away from this one. The final limiter still uses this level.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'After the lookahead, the output is clamped to this level. True Peak’s margin works under it while True Peak is on. The history line stays on the level you set here. Each strip’s own ceiling is this level times that band’s weight.',
          },
        ],
      },
    ],
  }),

  attack: infoDoc({
    name: 'Lookahead',
    lead: 'Sets how far ahead every strip and the final limiter look before a peak arrives.',
    meta: [
      { label: 'DAW name', value: 'Lookahead' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Range', value: '0.1 … 10 ms' },
      { label: 'Default', value: '5 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Longer means the gain can be down before the hit arrives, so the grab is smoother and the punch is softer. Shorter leaves more of the attack, and a very short look can miss the tip of a peak. The plugin reports the longest look as latency, so moving this does not make the host restart the delay.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'These are real milliseconds. A change crossfades over about 20 ms. Oversampling above 1× adds a few samples on top of this look.',
          },
        ],
      },
    ],
  }),

  release: infoDoc({
    name: 'Release',
    lead: 'Sets how quickly the gain comes back after a peak. The band Release knobs scale this time per strip.',
    meta: [
      { label: 'DAW name', value: 'Release' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Range', value: '1 … 1000 ms' },
      { label: 'Default', value: '50 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A short time lets the level return quickly, and you can hear it pump. A long time keeps the gain down through the gap. The final limiter uses this time as you set it. Each strip uses it scaled by that band’s Release.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'These are real milliseconds. The scale mark at 1000 is one second. ASC, Emphasis, Hold, and Min Release can all make the recovery differ from this number.',
          },
        ],
      },
    ],
  }),

  minRelease: infoDoc({
    name: 'Min Release',
    lead: 'Stops a strip from letting go faster than about two and a half cycles of that band’s bottom.',
    meta: [
      { label: 'DAW name', value: 'Min Release' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Turn it on when a low band chatters or grain on a short Release. The lowest band uses 30 Hz, so its floor is about 83 ms. Each higher band uses the crossover under it. High bands stay free to be fast. The final limiter is not given this floor.',
          },
        ],
      },
    ],
  }),

  asc: infoDoc({
    name: 'ASC',
    lead: 'Lets the release follow recent peaks instead of always recovering the same way.',
    meta: [
      { label: 'DAW name', value: 'ASC' },
      { label: 'Parameter ID', value: '14' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '1 (on)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'On dense material the recovery often sits more calmly than a fixed release. It runs on the strips and on the final limiter. With it off, Emphasis can only lengthen the release, because there is no quieter average to compare a hit with.',
          },
        ],
      },
    ],
  }),

  ascCoeff: infoDoc({
    name: 'ASC Level',
    lead: 'Sets how strongly ASC reshapes the release.',
    meta: [
      { label: 'DAW name', value: 'ASC Level' },
      { label: 'Parameter ID', value: '15' },
      { label: 'Range', value: '0 … 1' },
      { label: 'Default', value: '0.5' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Higher aims the recovery more toward the average of recent peaks. Lower stays closer to the Release time. At 0 the factor is 0.5, at 0.5 it is 1, and at 1 it is 2. It does nothing you can hear while ASC is off.',
          },
        ],
      },
    ],
  }),

  oversampling: infoDoc({
    name: 'Oversampling',
    lead: 'Runs the limiters faster than the session so peaks between samples are caught.',
    meta: [
      { label: 'DAW name', value: 'Oversampling' },
      { label: 'Parameter ID', value: '16' },
      { label: 'Range', value: '1× … 4×' },
      { label: 'Default', value: '1×' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '1× is the session rate. Higher rates catch bright peaks that fall between samples. Changing it resets the lookahead. It does not crossfade. True Peak forces at least 2× while it is on.',
          },
        ],
      },
    ],
  }),

  autoLevel: infoDoc({
    name: 'Auto Level',
    lead: 'Turns the output back up so the Limit still sits at full scale.',
    meta: [
      { label: 'DAW name', value: 'Auto Level' },
      { label: 'Parameter ID', value: '17' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '1 (on)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'With it on, lowering Limit makes the part louder as well as flatter. With it off, Limit is a quieter ceiling. The histories do not include this makeup, so you can still see the reduction on its own.',
          },
        ],
      },
    ],
  }),

  curve: infoDoc({
    name: 'Curve',
    lead: 'Sets the shape of the gain ride into and out of a peak.',
    meta: [
      { label: 'DAW name', value: 'Curve' },
      { label: 'Parameter ID', value: '18' },
      { label: 'Stored range', value: '0…2. The buttons send Lin 0, Log 1, Cos 2.' },
      { label: 'Default', value: '0 (Lin)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Lin rides the gain in a straight line.',
              'Log squares the ride, so more of the move happens late.',
              'Cos eases in and out. It is usually the softest grab.',
            ],
          },
        ],
      },
    ],
  }),

  knee: infoDoc({
    name: 'Soft Ceiling',
    lead: 'Starts the limiting a little before the ceiling, instead of a hard stop.',
    meta: [
      { label: 'DAW name', value: 'Soft Ceiling' },
      { label: 'Parameter ID', value: '19' },
      { label: 'Range', value: '0 … 12 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 the stop is hard. Raise it and reduction begins that many decibels under the ceiling and eases in. The width sits entirely below Limit. It is not centred on it.',
          },
        ],
      },
    ],
  }),

  colorEnable: infoDoc({
    name: 'Color',
    lead: 'Turns on a soft saturation before the signal is split.',
    meta: [
      { label: 'DAW name', value: 'Color Enable' },
      { label: 'Parameter ID', value: '20' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Off is a clean path into the crossovers. On, the Color amount shapes the whole signal before any strip sees it. The amount stays stored while this is off. Diff Listen does not include it.',
          },
        ],
      },
    ],
  }),

  color: infoDoc({
    name: 'Color',
    lead: 'Sets how hard that saturation is driven.',
    meta: [
      { label: 'DAW name', value: 'Color' },
      { label: 'Parameter ID', value: '21' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '35 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Low is a little density. High is obvious drive. You only hear it while Color is on. It is a tanh curve. At 100 % the drive is five times the signal, blended with the dry.',
          },
        ],
      },
    ],
  }),

  truePeak: infoDoc({
    name: 'True Peak',
    lead: 'Leaves a margin under the ceiling and forces at least 2× oversampling.',
    meta: [
      { label: 'DAW name', value: 'True Peak' },
      { label: 'Parameter ID', value: '22' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Off is a sample-peak ceiling, and the output can still peak between samples after a bounce. On, the working ceiling is Limit minus TP Margin, so inter-sample peaks have room. The final clamp and the history line stay on the Limit you set.',
          },
        ],
      },
    ],
  }),

  margin: infoDoc({
    name: 'TP Margin',
    lead: 'Sets how far under Limit the working ceiling sits while True Peak is on.',
    meta: [
      { label: 'DAW name', value: 'TP Margin' },
      { label: 'Parameter ID', value: '23' },
      { label: 'Range', value: '0 … 3 dB' },
      { label: 'Default', value: '0.1 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'A small margin stays loud. A larger one leaves more unused room after export. It does nothing while True Peak is off.',
          },
        ],
      },
    ],
  }),

  holdEnable: infoDoc({
    name: 'Hold',
    lead: 'Holds the gain down for a moment after a peak before the release starts.',
    meta: [
      { label: 'DAW name', value: 'Hold Enable' },
      { label: 'Parameter ID', value: '25' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Off means release can start as soon as the peak has passed. On, Release Hold sets the pause. The time stays stored while this is off. A deeper peak can still pull the gain down during the hold.',
          },
        ],
      },
    ],
  }),

  releaseHold: infoDoc({
    name: 'Release Hold',
    lead: 'Sets how long the gain stays down before release, on the strips and on the final limiter.',
    meta: [
      { label: 'DAW name', value: 'Release Hold' },
      { label: 'Parameter ID', value: '26' },
      { label: 'Range', value: '0 … 500 ms' },
      { label: 'Default', value: '25 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A short hold keeps a consonant or a click from opening a pump right after the hit. Too long and the phrase stays ducked after every peak. These are real milliseconds. You only hear it while Hold is on.',
          },
        ],
      },
    ],
  }),

  emphasisEnable: infoDoc({
    name: 'Emphasis',
    lead: 'Lets the release differ between a sharp hit and a note that stays loud.',
    meta: [
      { label: 'DAW name', value: 'Emphasis Enable' },
      { label: 'Parameter ID', value: '27' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Off, the release is the time you set, plus ASC and Min Release. On, the amount makes a hit recover differently from a sustained note. The amount stays stored while this is off.',
          },
        ],
      },
    ],
  }),

  emphasis: infoDoc({
    name: 'Emphasis',
    lead: 'Sets how far that difference goes.',
    meta: [
      { label: 'DAW name', value: 'Emphasis' },
      { label: 'Parameter ID', value: '28' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '40 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'With ASC on, a sharp hit can recover faster than a held note. At 100 % the fast end is about a quarter of the release and the slow end is a bit over twice it. With ASC off there is no quieter average to compare, so this only lengthens the release. You only hear it while Emphasis is on.',
          },
        ],
      },
    ],
  }),

  gr: infoDoc({
    name: 'GR',
    lead: 'Shows the deepest gain reduction among the active strips and the final limiter.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: 'A short spike on a hit is a peak being caught. A number that stays up means something is being held through the phrase. The scale goes to 24 dB, with marks at 1, 3, 6, and 12. Each band’s own GR meter can show more, up to 60 dB, and already includes the final limiter.',
          },
        ],
      },
    ],
  }),
} as const;
