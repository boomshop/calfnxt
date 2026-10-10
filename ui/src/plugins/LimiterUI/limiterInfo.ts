/** Hover titles for Limiter controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const limiterInfo = {
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
            p: 'Turn it on and the ceiling, the color, and the gain ride are out of the sound. The switch is delayed to the same latency as the limiter, so the comparison does not jump in time. The fade is a short equal-power crossfade.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'While it is on, the header In and Out gains are unity.',
              'The GR meter sits at 0. The history draws the input and no reduction.',
              'Diff Listen is not what you hear while Bypass has finished fading.',
            ],
          },
        ],
      },
    ],
  }),

  limit: infoDoc({
    name: 'Limit',
    lead: 'Sets the ceiling. Peaks above it are turned down so the output does not go past it.',
    meta: [
      { label: 'DAW name', value: 'Limit' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Range', value: '−24 … 0 dB' },
      { label: 'Default', value: '0 dB' },
      { label: 'Display', value: 'One decimal place, with dB.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 dB only the peaks that already reach full scale are touched. Lower it and more of the phrase hits the ceiling. The loud moments sit closer together. With Auto Level on, that also turns the whole result up so the ceiling is back at full scale, and the part gets louder as well as flatter.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Watch GR. A short jump on a hit means only that hit was caught. A number that stays up through the phrase means the ceiling is below the body of the sound, not only the peaks. If you wanted the peaks caught and the body left alone, raise Limit until GR returns to 0 between the hits.',
          },
        ],
      },
      {
        heading: 'On the graph',
        blocks: [
          {
            p: 'The history draws this ceiling as a dashed line. The fills are the level before and after the limiter gain. Auto Level is not in that picture, so you still see the reduction on its own.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'After the lookahead, the output is also clamped to this level. True Peak’s margin works under it. The clamp stays on the level you set here.',
          },
        ],
      },
    ],
  }),

  attack: infoDoc({
    name: 'Lookahead',
    lead: 'Sets how far ahead the limiter sees a peak, in real milliseconds. That look is also the latency the host is told.',
    meta: [
      { label: 'DAW name', value: 'Lookahead' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '0.1 … 10 ms' },
      { label: 'Default', value: '5 ms' },
      { label: 'Display', value: 'Two decimal places, with ms.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A longer look starts turning the gain down before the peak arrives, so the hit is caught more smoothly and the attack is rounded. A shorter look leaves more of the stick, and a very fast peak has less time to be anticipated. This is a clock time, not the speed scale used by the compressor.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Loop one hit. Shorten it until the click is back and GR still catches the peak. If you hear the gain arrive late and the peak snaps, lengthen it. Changing it crossfades the delay over about 20 ms so the read point does not jump.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Oversampling above 1× adds 4 samples of latency on top of this look. True Peak forces at least 2×, so it adds those samples even when the Oversampling knob says 1×.',
          },
        ],
      },
    ],
  }),

  release: infoDoc({
    name: 'Release',
    lead: 'Sets how long the gain takes to come back after a peak, in real milliseconds.',
    meta: [
      { label: 'DAW name', value: 'Release' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '1 … 1000 ms' },
      { label: 'Default', value: '50 ms' },
      { label: 'Display', value: 'Whole milliseconds. 1000 ms is shown as 1 s.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A shorter time opens back up quickly. The next note is loud again, and you can hear the level move on every hit. A longer time keeps the phrase turned down after the peak. The body stays even, and the quiet part after a hit stays quiet too.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Watch GR through the gap after a hit. If it falls to 0 and jumps again, and you hear that as a pump, lengthen the release. If GR is still up when the next phrase should be open, shorten it. Hold can keep it down for a fixed time before this recovery starts. ASC and Emphasis can change this recovery without moving the knob.',
          },
        ],
      },
    ],
  }),

  asc: infoDoc({
    name: 'ASC',
    lead: 'Lets the release take the recent peaks into account, instead of always opening on the Release time alone.',
    meta: [
      { label: 'DAW name', value: 'ASC' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '1 (on)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'On, a run of loud peaks keeps the gain from springing all the way back between them. Off, recovery is only Release, Hold, Emphasis, and Curve. ASC Level does nothing while this is off.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'It keeps an average of peaks that cross the ceiling, including the soft-ceiling start. The release can aim at that average instead of at unity. Emphasis uses the same average to tell a transient from a sustained peak. With ASC off there is no average, and Emphasis only lengthens the release.',
          },
        ],
      },
    ],
  }),

  ascCoeff: infoDoc({
    name: 'ASC Level',
    lead: 'Sets how strongly that recent-peak average holds the release back.',
    meta: [
      { label: 'DAW name', value: 'ASC Level' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '0 … 1' },
      { label: 'Default', value: '0.5' },
      { label: 'Display', value: 'Two decimal places.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Higher keeps more of the reduction after a loud passage, so the level does not bounce back as hard. Lower lets Release open further toward unity. At the default the internal weight is 1. This knob is idle while ASC is off.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Set Release for a single hit. Then play a busy phrase. If the gain chatters between the hits, raise ASC Level. If the phrase stays ducked after the loud part has passed, lower it.',
          },
        ],
      },
    ],
  }),

  oversampling: infoDoc({
    name: 'Oversampling',
    lead: 'Runs the limiter at 1×, 2×, 3×, or 4× the host rate, so peaks that fall between samples can be seen.',
    meta: [
      { label: 'DAW name', value: 'Oversampling' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Range', value: '1 … 4, shown as n×' },
      { label: 'Default', value: '1×' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '1× limits the samples the host gave you. A higher factor catches brighter peaks that would otherwise stick out between those samples. It costs more CPU. True Peak will not stay at 1×: it forces at least 2×.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Changing the factor rebuilds the limiter. Above 1×, latency grows by 4 samples on top of the lookahead. The history and the GR meter stay in host time.',
          },
        ],
      },
    ],
  }),

  autoLevel: infoDoc({
    name: 'Auto Level',
    lead: 'Turns the limited signal up by the inverse of Limit, so the ceiling sits at full scale again.',
    meta: [
      { label: 'DAW name', value: 'Auto Level' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '1 (on)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'On, lowering Limit does not make the part quieter. It makes the peaks flatter and the rest louder, up to 0 dB. Off, Limit is a real lower ceiling and the part gets quieter as you pull it down. Use Bypass to hear the original. Use this to choose whether the comparison should be at the same peak level.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The boost is 1 divided by the linear Limit, after the clamp. The history is drawn before this boost. Diff Listen hears the signal after it.',
          },
        ],
      },
    ],
  }),

  curve: infoDoc({
    name: 'Curve',
    lead: 'Sets the shape of the gain move into a peak and back out. It does not change the ceiling.',
    meta: [
      { label: 'DAW name', value: 'Curve' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Stored range', value: '0…2. The buttons send Lin 0, Log 1, Cos 2.' },
      { label: 'Default', value: '0 (Lin)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Lin moves the gain in a straight line over the release.',
              'Log starts that move slowly and catches up later, so the grab is more back-weighted.',
              'Cos eases in and out. The start and the end of the move are softer than the middle.',
            ],
          },
        ],
      },
      {
        heading: 'How to compare',
        blocks: [
          {
            p: 'Loop one hit and switch Curve without moving Limit or Release. Listen for whether the gain arrives evenly, late, or with a soft edge. GR still shows the same amount of reduction when the peak needs it. The shape is how it gets there.',
          },
        ],
      },
    ],
  }),

  knee: infoDoc({
    name: 'Soft Ceiling',
    lead: 'Starts the limiting this many decibels below Limit, and eases into the ceiling instead of stopping dead at it.',
    meta: [
      { label: 'DAW name', value: 'Soft Ceiling' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Range', value: '0 … 12 dB' },
      { label: 'Default', value: '0 dB' },
      { label: 'Display', value: 'One decimal place, with dB.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 the limiter does nothing until the peak reaches Limit, then it holds that peak at the ceiling. Raise it and peaks that are still under Limit already get a little reduction. The loudest peaks still land on Limit. The result is less of a hard stop, and GR moves on more of the phrase.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'If you can hear the gain switch on at one level, raise this until that switch disappears. If GR is up on notes that should have been left alone, the soft start is wide for this ceiling. Lower it, or raise Limit.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The width sits entirely below Limit. At 6 dB, reduction begins 6 dB under the ceiling and a smoothstep eases the peak up toward it. This is not centred on the ceiling the way the compressor knee is centred on its threshold.',
          },
        ],
      },
    ],
  }),

  colorEnable: infoDoc({
    name: 'Color Enable',
    lead: 'Turns on a soft saturation before the limiter. Off leaves the path into the ceiling clean.',
    meta: [
      { label: 'DAW name', value: 'Color Enable' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'The Color amount stays where you set it while this is off, so you can compare the clean ceiling with the saturated one without losing the amount. Saturation is before the lookahead. It can change which peaks the limiter sees.',
          },
        ],
      },
    ],
  }),

  color: infoDoc({
    name: 'Color',
    lead: 'Sets how hard the signal is driven into a soft clip before the limiter.',
    meta: [
      { label: 'DAW name', value: 'Color' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '35 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Low amounts round the peaks a little, so the limiter has less of a spike to catch. High amounts are an obvious drive: the tone thickens and the peaks are already flattened before the ceiling. You hear none of it while Color Enable is off.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Turn Color on and raise this until the peaks feel denser, then listen to whether the tone itself has changed. If the part sounds distorted on notes that were not peaking, it is past a gentle round-off. Diff Listen does not solo this drive. It solos what the gain and the clamp removed after it.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The curve is a tanh. Drive runs from 1 at 0 % to 5 at 100 %. The amount blends that curve with the dry sample, then the limiter sees the result.',
          },
        ],
      },
    ],
  }),

  truePeak: infoDoc({
    name: 'True Peak',
    lead: 'Looks between the samples, and holds the limiter a little under the ceiling by the TP Margin.',
    meta: [
      { label: 'DAW name', value: 'True Peak' },
      { label: 'Parameter ID', value: '14' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Off, the ceiling is the samples themselves. A bright peak can still stick out between them after a bounce. On, oversampling is at least 2× even if the knob says 1×, and the working ceiling drops by TP Margin. The final clamp is still the Limit you set. The part can end up a fraction quieter, and those between-sample peaks are what the limiter is now catching.',
          },
        ],
      },
    ],
  }),

  margin: infoDoc({
    name: 'TP Margin',
    lead: 'Sets how far under Limit the true-peak detector works. It does nothing while True Peak is off.',
    meta: [
      { label: 'DAW name', value: 'TP Margin' },
      { label: 'Parameter ID', value: '15' },
      { label: 'Range', value: '0 … 3 dB' },
      { label: 'Default', value: '0.1 dB' },
      { label: 'Display', value: 'Two decimal places, with dB.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A small margin, the default is 0.1 dB, keeps the ceiling close to Limit and still leaves a little room for what happens between samples. A larger margin turns the peaks down further. The history line stays on Limit. This margin is under that line, not a second ceiling you can see there.',
          },
        ],
      },
    ],
  }),

  diffListen: infoDoc({
    name: 'Diff Listen',
    lead: 'Lets you hear what the limiter removed: the signal before the gain, minus the limited signal.',
    meta: [
      { label: 'DAW name', value: 'Diff Listen' },
      { label: 'Parameter ID', value: '16' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Silence means nothing was removed. A short tick on a hit means only that hit was caught. A continuous scratch of the whole phrase means the ceiling is holding the body, not only the peaks. Color is already in both sides of this difference, so you are not hearing the drive by itself. You are hearing what the gain and the clamp took off after it.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The two paths use the same oversampling filters, so the difference is quiet when the gain is unity. Auto Level is in both sides. Bypass replaces this with the dry signal once the fade has finished.',
          },
        ],
      },
    ],
  }),

  holdEnable: infoDoc({
    name: 'Hold Enable',
    lead: 'Holds the gain down for Release Hold after a peak, before the release is allowed to open.',
    meta: [
      { label: 'DAW name', value: 'Hold Enable' },
      { label: 'Parameter ID', value: '17' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Off, recovery starts as soon as the peak has passed. On, it waits the Hold time first. A deeper peak can still push the gain further during that wait. The Hold time stays stored while this is off.',
          },
        ],
      },
    ],
  }),

  releaseHold: infoDoc({
    name: 'Release Hold',
    lead: 'Sets that wait, in real milliseconds. It does nothing while Hold Enable is off.',
    meta: [
      { label: 'DAW name', value: 'Release Hold' },
      { label: 'Parameter ID', value: '18' },
      { label: 'Range', value: '0 … 500 ms' },
      { label: 'Default', value: '25 ms' },
      { label: 'Display', value: 'Whole milliseconds.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A short hold keeps the gain from fluttering in the first few milliseconds after a hit. A long hold keeps the phrase ducked after the hit has gone. If the next note is still quiet and GR is still up, the hold is longer than the gap.',
          },
        ],
      },
    ],
  }),

  emphasisEnable: infoDoc({
    name: 'Emphasis Enable',
    lead: 'Lets Emphasis change the release depending on whether the peak is a transient or part of a loud passage.',
    meta: [
      { label: 'DAW name', value: 'Emphasis Enable' },
      { label: 'Parameter ID', value: '19' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'The amount stays stored while this is off. The comparison needs ASC on. ASC is what keeps the recent average. With ASC off, Emphasis has no average to compare against and only lengthens the release.',
          },
        ],
      },
    ],
  }),

  emphasis: infoDoc({
    name: 'Emphasis',
    lead: 'Makes a sharp peak recover faster than a peak that is already near the recent average.',
    meta: [
      { label: 'DAW name', value: 'Emphasis' },
      { label: 'Parameter ID', value: '20' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '40 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Higher means a bigger difference. A hit that sticks out of a quieter average opens back up sooner. A peak that is close to the recent loudness stays down longer. At 0 % the release is only the Release knob, plus Hold and ASC. You hear none of this while Emphasis Enable is off.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'At 100 %, a strong transient can shorten the release to about a quarter of the knob, and a sustained peak can lengthen it to about 2.25 times. Those are the ends of the scale. Most peaks land between them.',
          },
        ],
      },
    ],
  }),

  gr: infoDoc({
    name: 'GR',
    lead: 'Shows how many decibels the limiter is turning the signal down right now. It is a meter, not a control.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: '0 means the signal is under the ceiling. A higher number means more reduction. The scale runs to 24 dB, with marks at 1, 3, 6, and 12. A short jump on a hit means only that hit was caught. A number that stays up means the ceiling is holding the phrase, not only the peaks.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The meter follows the current gain. It does not keep a peak. Full bypass forces it to 0. Auto Level is not in this number: it shows the reduction, then the boost happens after.',
          },
        ],
      },
    ],
  }),

  history: infoDoc({
    name: 'History',
    lead: 'Shows the last 8 seconds of the level the limiter is riding, and how far it is turning that level down.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            ul: [
              'One fill is the level before the limiter gain. The other is the level after it. Auto Level is not in either, so a lower Limit does not just look like a louder mix.',
              'The dashed line is Limit.',
              'GR, on by default, is the gain. It sits at 0 dB when nothing is reduced and moves down by the amount being turned down. The meter beside it shows that amount as a positive number, up to 24 dB.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: '0 dB stays at the top. The bottom of the scale follows the level, in 6 dB steps, and does not go below −60 dB. Color is already in the level the fills are drawn from. While Bypass is on, the fill is the input and the gain line stays at 0 dB.',
          },
        ],
      },
    ],
  }),
} as const;
