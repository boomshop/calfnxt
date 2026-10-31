/** Hover titles for DeEsser controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const deesserInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Lets the signal through with no de-essing, so you can compare the processed sound with the untouched one.',
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
            p: 'Turn it on and listen for the ess or the rumble coming back. Turn it off and the reduction is back. Use that to decide whether the problem got quieter, or whether the voice just got duller or thinner.',
          },
          {
            p: 'When the short fade has finished, the GR meter sits at 0.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'While it is on, the header In and Out gains are unity.',
              'Listen does not replace the output while Bypass is on.',
            ],
          },
        ],
      },
    ],
  }),

  channel: infoDoc({
    name: 'Channel',
    lead: 'Chooses which part of the stereo signal is turned down. The same choice is what the detector listens to.',
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
              'Stereo turns both sides down together. The detector follows the average of the two sides, so one loud ess pulls both.',
              'Left or Right treats that side only. The other side is left at its level.',
              'Mid treats the centre. The wide part stays at its level.',
              'Side treats the wide part. The centre stays at its level.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'In Split, the part you are not treating still passes through the crossover and comes back unchanged in level, so it stays in step with the treated part. In Wide, that untreated part is left completely alone. There is no Link control: Stereo always uses the average.',
          },
        ],
      },
    ],
  }),

  target: infoDoc({
    name: 'Target',
    lead: 'Chooses whether this is looking for brightness or for low-end weight.',
    meta: [
      { label: 'DAW name', value: 'Target' },
      { label: 'Parameter ID', value: '16' },
      { label: 'Stored range', value: '0…1. The buttons send Ess 0, Rumble 1.' },
      { label: 'Default', value: '0 (Ess)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Ess listens through a high-pass. In Split it turns down what is above the Split frequency: the hiss and the consonants.',
              'Rumble listens through a low-pass. In Split it turns down what is below Split: the thump and the mud.',
            ],
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Switching Target does not move Split, Peak, or the slopes. After you change it, Listen and retune those until the solo is the problem you mean. Ess at the rumble frequencies, or the other way around, will turn down the wrong band.',
          },
        ],
      },
    ],
  }),

  mode: infoDoc({
    name: 'Mode',
    lead: 'Chooses whether a detection turns the whole signal down, or only the problem band.',
    meta: [
      { label: 'DAW name', value: 'Mode' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Stored range', value: '0…1. The buttons send Wide 0, Split 1.' },
      { label: 'Default', value: '0 (Wide)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Wide turns the whole selected path down while the detector is over the threshold. The ess gets quieter, and so does the rest of that moment.',
              'Split turns down only one side of the crossover. Ess turns down the highs. Rumble turns down the lows. The other band stays at its level, so the body of the sound can remain while the problem band gives way.',
            ],
          },
        ],
      },
      {
        heading: 'How to compare',
        blocks: [
          {
            p: 'Set the detector with Listen, then switch Mode on the same phrase. If Wide makes the whole word smaller and you only wanted the consonant quieter, Split is the one that leaves the rest alone. If the problem is the whole moment, Wide is doing that on purpose.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'When nothing is being reduced, Split puts the two bands back together without a notch at the crossover. The slope of that crossover is the Slope control, and it is the same slope the detector filter uses.',
          },
        ],
      },
    ],
  }),

  threshold: infoDoc({
    name: 'Threshold',
    lead: 'Sets how loud the detector has to get before anything is turned down.',
    meta: [
      { label: 'DAW name', value: 'Threshold' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '−60 … 0 dB' },
      { label: 'Default', value: '−18 dB' },
      { label: 'Display', value: 'Two decimal places on the knob.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'This level is the detector, not the whole mix. Lower it and quieter esses or rumbles start moving the GR meter. Raise it and only the louder spikes do. The rest of the phrase stays put.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Turn Listen on and confirm the solo is the problem. Then turn Listen off and lower Threshold until GR moves on those moments and sits at 0 on the words you want left alone. If the body of the phrase is being turned down with the ess, the threshold is below that body, or the detector is still hearing it. Fix the detector before you keep lowering this.',
          },
        ],
      },
      {
        heading: 'On the graph',
        blocks: [
          {
            p: 'The history draws this as a dashed line. GR, on by default, moves when the detector rises above it. There is no Knee knob. The start is already a little rounded: reduction eases in about 4.5 dB below this line and reaches the full ratio about 4.5 dB above it.',
          },
        ],
      },
    ],
  }),

  ratio: infoDoc({
    name: 'Ratio',
    lead: 'Sets how much of the detector level above the threshold is turned down.',
    meta: [
      { label: 'DAW name', value: 'Ratio' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '1 … 20, shown as n:1' },
      { label: 'Default', value: '3:1' },
      { label: 'Display', value: 'One decimal place on the knob.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '1:1 leaves the level alone. 3:1 means a detector peak 3 dB over the working part of the curve comes out about 1 dB over, and that gain is what gets applied. In Wide it applies to the whole path. In Split it applies only to the problem band. Higher numbers hold that peak flatter.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Raise it until the spike you heard in Listen is held and the surrounding sound still has its tone. If the consonant collapses into a lisp, or the low end pumps, the ratio is past the spike you meant to catch. A well-aimed detector needs less ratio than a detector that is still hearing the whole voice.',
          },
        ],
      },
    ],
  }),

  laxity: infoDoc({
    name: 'Laxity',
    lead: 'Sets how quickly the gain takes hold and lets go. One number does both.',
    meta: [
      { label: 'DAW name', value: 'Laxity' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Range', value: '1 … 100' },
      { label: 'Default', value: '15' },
      { label: 'Display', value: 'Whole numbers. No unit: this is not a clock time in milliseconds.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A lower number grabs the spike and lets go quickly. The ess is caught, and the gain can chatter if the phrase is busy. A higher number is slower to grab and slower to return. A short ess can slip through, and the word stays turned down a little longer after it.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Watch GR on one ess. If it ticks and you hear the gain flicking, raise Laxity until the tick becomes one move. If the ess has already gone before GR moves, lower it. Double the number and both the grab and the release are about twice as slow.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'The number is the attack speed. The release speed is that number times 1.33. There is no separate Attack or Release knob.',
              'It uses the same speed scale as the compressor. About a quarter of the number is the attack time constant in milliseconds. The release time constant is about a third of the number. At the fastest end that gets less exact.',
              'In Peak and RMS this eases the gain. In Opto it eases the measured level, and a deeper reduction makes that slower.',
            ],
          },
        ],
      },
    ],
  }),

  split: infoDoc({
    name: 'Split',
    lead: 'Sets the frequency that divides the problem band from the rest, and the frequency the detector starts from.',
    meta: [
      { label: 'DAW name', value: 'Split' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '4 000 Hz' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'In Split with Ess, what is above this can be turned down and what is below stays. In Split with Rumble, what is below this can be turned down and what is above stays. The same frequency is where the detector’s high-pass or low-pass begins, so Listen changes with it.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Turn Listen on and move this until the solo is mostly the problem and the tone you want to keep has fallen away. Then turn Listen off. If the body of the voice ducks with the ess, this is still low enough that the voice is inside the band being reduced. Raise it. If the ess is still obvious and GR barely moves, the band is above the ess. Lower it.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'In Wide this frequency does not split the audio. The whole path is turned down together. It still sets the detector filter. There is no fixed ess band: the default of 4 kHz is only a starting point.',
          },
        ],
      },
    ],
  }),

  makeup: infoDoc({
    name: 'Makeup',
    lead: 'Turns the processed path back up after the reduction, so a comparison is about the tone and not only about loudness.',
    meta: [
      { label: 'DAW name', value: 'Makeup' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Range', value: '0 … 24 dB' },
      { label: 'Default', value: '0 dB' },
      { label: 'Display', value: 'Two decimal places on the knob.' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'If Bypass is an obvious jump louder, raise this until the jump is about the ess, not the size of the voice. If you need a lot of it, the detector or the ratio is holding more of the phrase than the spikes. The history does not include this gain.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'In Split it raises the sum, including the band that was not reduced. On Left or Right it raises only the treated side.',
          },
        ],
      },
    ],
  }),

  detection: infoDoc({
    name: 'Detection',
    lead: 'Sets how the detector takes hold of the level: on the instant spike, on a short average, or more gently once it is already working.',
    meta: [
      { label: 'DAW name', value: 'Detection' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Stored range', value: '0…2. The buttons send Peak 0, RMS 1, Opto 2.' },
      { label: 'Default', value: '1 (RMS)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Peak grabs the loudest instant. A sharp ess moves GR immediately. If only the click is caught, that is Peak doing its job.',
              'RMS follows a short average, so the body of the ess moves GR more than one sample. A single click gets through more easily.',
              'Opto eases off once reduction is already happening. It is less abrupt on a busy phrase. This is a generic behaviour, not a copy of a particular optical unit.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The average in RMS is fixed and short. Laxity eases the gain after it. In Opto, Laxity eases the measured level, and a deeper reduction slows that further.',
          },
        ],
      },
    ],
  }),

  slope: infoDoc({
    name: 'Slope',
    lead: 'Sets how steep the split is, and how steeply the detector ignores the side of the spectrum you are not chasing.',
    meta: [
      { label: 'DAW name', value: 'Slope' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Stored range', value: '12 … 48. The buttons send 12, 24, or 48 dB/oct.' },
      { label: 'Default', value: '24 dB/oct' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Steeper means a sharper line at Split. In Split mode the untreated band falls away faster, so less of the voice is inside the band being reduced. The detector gets the same slope: Ess ignores lows more sharply, Rumble ignores highs more sharply. Check that with Listen.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'If the reduction still dulls or thins notes that should have stayed, try a steeper slope and listen to whether those notes have left the solo. If the solo becomes so narrow that the ess you wanted is mostly gone, ease it back.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Only 12, 24, and 48 are available. A value in between snaps to one of those. 36 is not used, because the two bands have to sum flat when the gain is unity. The audio crossover is Linkwitz–Riley. The detector filter uses the same stage count, with the Q from HP Q or LP Q.',
          },
        ],
      },
    ],
  }),

  hpQ: infoDoc({
    name: 'HP Q',
    lead: 'Sets the resonance of the detector filter at the Split frequency. It does not change the audio crossover.',
    meta: [
      { label: 'DAW name', value: 'HP Q' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Range', value: '0.1 … 20' },
      { label: 'Default', value: '0.707' },
      { label: 'Display', value: 'Two decimal places, so the default reads 0.71.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'You hear it only in Listen, or as a change in what makes GR move. Higher Q puts a sharper emphasis on the cutoff, so the detector locks onto a narrower spot. The knob reads LP Q when Target is Rumble: same control, on the low-pass.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Raise it while Listen is on if the problem sits right on the cutoff and the solo is still too wide. If GR starts ticking on notes that only graze that frequency, the peak is too sharp. The chart shows the bump.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Each detector stage uses this Q. The audio split does not. Its crossover stays Linkwitz–Riley at the Slope you set.',
          },
        ],
      },
    ],
  }),

  peakFreq: infoDoc({
    name: 'Peak',
    lead: 'Aims a bell in the detector at the frequency that should cause the reduction.',
    meta: [
      { label: 'DAW name', value: 'Peak' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '4 500 Hz' },
    ],
    sections: [
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Turn Listen on and sweep this until the solo is mostly the ess, or the rumble, and the notes you want to keep are quieter in that solo. The default of 4.5 kHz is a starting point for Ess, not a rule. Rumble usually wants this much lower, and Target will not move it for you.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The bell sits after the high-pass or low-pass. It is only in the detector. The chart draws it on top of that filter.',
          },
        ],
      },
    ],
  }),

  peakGain: infoDoc({
    name: 'Peak Gain',
    lead: 'Sets how much that detector bell boosts or cuts the spot you aimed at.',
    meta: [
      { label: 'DAW name', value: 'Peak Gain' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Range', value: '−24 … 24 dB' },
      { label: 'Default', value: '12 dB' },
      { label: 'Display', value: 'Two decimal places on the knob.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'More boost makes that frequency more likely to move GR, and makes the rest of the detector relatively quieter. A cut does the opposite: that spot has to be louder before it triggers. 0 dB leaves the bell flat. This is not makeup, and it is not in the output unless Listen is on.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'If the right frequency is in the solo but GR still sits at 0 on the ess, raise the boost. If ordinary words start moving GR because they contain a little of that frequency, the boost is past the problem. Lower it, or raise Threshold.',
          },
        ],
      },
    ],
  }),

  peakQ: infoDoc({
    name: 'Peak Q',
    lead: 'Sets how narrow the detector bell is.',
    meta: [
      { label: 'DAW name', value: 'Peak Q' },
      { label: 'Parameter ID', value: '14' },
      { label: 'Range', value: '0.1 … 20' },
      { label: 'Default', value: '1' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Higher Q is a narrower bell, so only a tight band around Peak pushes the detector. Lower Q lets a wider area around it contribute. Listen and the chart both show the width.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Narrow it when a specific whistle is the problem and the solo is still full of the vowel. Widen it when the ess moves around in pitch and a narrow bell keeps missing it. If GR chatters on every harmonic that crosses the peak, it is narrower than the problem.',
          },
        ],
      },
    ],
  }),

  listen: infoDoc({
    name: 'Listen',
    lead: 'Lets you hear what the detector is using, instead of the processed signal. While this is on, nothing is turned down.',
    meta: [
      { label: 'DAW name', value: 'Listen' },
      { label: 'Parameter ID', value: '15' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The high-pass or low-pass, then the peak bell. Ess is the top. Rumble is the bottom. Channel picks which part of the picture that is. Left or Right plays only that side. Mid plays the centre on both speakers. Side plays the wide part, left and inverted right.',
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Turn it on and tune Split, Slope, and the peak until the solo is the thing that should be turned down. Then turn it off and judge the result. The GR meter can still move while you listen. That reduction is not in the solo. Makeup is not in it either.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Listen does nothing while Bypass is on. While it is on, the history follows the detector level rather than the program.',
          },
        ],
      },
    ],
  }),

  gr: infoDoc({
    name: 'GR',
    lead: 'Shows how many decibels are being turned down right now. It is a meter, not a control.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: '0 means the detector is under the threshold. A higher number means more reduction, up to 60 dB on the scale, with marks at 1, 3, 6, and 12. A short jump on an ess means only that ess was caught. A number that stays up through the vowel means the detector is still hearing the vowel.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The meter follows the current reduction. It does not keep a peak. Full bypass forces it to 0. In Split this is the gain on the problem band, not a reduction of the whole mix by that many decibels.',
          },
        ],
      },
    ],
  }),

  history: infoDoc({
    name: 'History',
    lead: 'Shows the last 8 seconds of the level being treated, and how far it is being turned down.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            ul: [
              'One fill is the level before the gain. The other is the level after it. Makeup is not in either.',
              'In Split, the before-fill is the two bands together and the after-fill is with only the problem band turned down.',
              'The dashed line is Threshold. GR, on by default, is the gain: it sits at 0 dB when nothing is reduced and moves down by the amount being turned down. Trig is off until you turn it on. Trig is the detector, which is not the same as the fill.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: '0 dB stays at the top. The bottom of the scale follows the level, in 6 dB steps, and does not go below −60 dB. While Listen is on, the fills follow the detector level.',
          },
        ],
      },
    ],
  }),

  detectionChart: infoDoc({
    name: 'Detection',
    lead: 'Shows the filter the detector is listening through. It is not the tone of the output, unless Listen is on.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'Ess draws a high-pass from Split. Rumble draws a low-pass from Split. Slope sets how steep that side is. HP Q, or LP Q, sets the bump at the cutoff. The bell is Peak, Peak Gain, and Peak Q. A higher bell means that spot contributes more to the detector.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The audio crossover in Split uses the same frequency and slope, without this resonance and without the bell. Those two belong only to the detector.',
          },
        ],
      },
    ],
  }),
} as const;
