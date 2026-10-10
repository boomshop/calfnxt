/** Hover titles for Reverb controls (musicians / producers). */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';
import type { FrequencyRangeInfo } from '../../widgets/FrequencyRange/frequencyRangeInfo';

export const reverbInfo = {
  active: infoDoc({
    name: 'Active',
    lead: 'Turns the reverb you hear on or off. Dry stays at the level you set.',
    meta: [
      { label: 'DAW name', value: 'Active' },
      { label: 'Parameter ID', value: '2' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '1 (on)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Off, the wet level goes to silence. The room keeps running, so turning it back on brings back whatever is already in the tank, not a fresh start. The header In and Out gains always apply. There is no separate bypass.',
          },
        ],
      },
    ],
  }),

  quality: infoDoc({
    name: 'Quality',
    lead: 'Chooses how dense the room is, and how much work it does.',
    meta: [
      { label: 'DAW name', value: 'Quality' },
      { label: 'Parameter ID', value: '33' },
      { label: 'Stored range', value: '0…2. The buttons send Lo 0, Mid 1, Hi 2.' },
      { label: 'Default', value: '1 (Mid)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Lo uses 4 late stages instead of 6, fewer early taps (Multi-Tap up to 12, Velvet up to 24), and turns Pre Diff off. The tail can sound grainier.',
              'Mid is the full late network, the full early taps, and Pre Diff with 4 stages.',
              'Hi is the same late network and the same early taps, with Pre Diff at 6 stages. You hear that only when Pre Diff is up.',
            ],
          },
        ],
      },
    ],
  }),

  room: infoDoc({
    name: 'Room Size',
    lead: 'Sets the longest wall of the room, in metres.',
    meta: [
      { label: 'DAW name', value: 'Room Size' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Range', value: '2 … 40 m' },
      { label: 'Default', value: '12 m' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Bigger stretches the early paths and the late network. Smaller is a box. Very small sizes are lifted inside the late network so the wash does not turn into a short metallic ring. 40 m is a long wall, not a radius.',
          },
        ],
      },
    ],
  }),

  distance: infoDoc({
    name: 'Distance',
    lead: 'Sets how far the listener sits from the source.',
    meta: [
      { label: 'DAW name', value: 'Distance' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '0 … 1' },
      { label: 'Default', value: '0.45' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Near is tighter. Far adds up to 40 ms on top of Predelay, and it lifts Air a little. The early reflections move with it. The chart’s late start includes that extra time.',
          },
        ],
      },
    ],
  }),

  decay: infoDoc({
    name: 'Decay',
    lead: 'Sets how long the late wash takes to fall by about 60 dB.',
    meta: [
      { label: 'DAW name', value: 'Decay' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '0.4 … 15 s' },
      { label: 'Default', value: '1.5 s' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'These are real seconds, for the late loop. Early reflections are not this time. HF Damp and LF Damp can make the tail sound shorter than the number, because the brightness or the bass dies first. Freeze holds the loop instead of using this decay.',
          },
        ],
      },
    ],
  }),

  diffusion: infoDoc({
    name: 'Diffusion',
    lead: 'Sets how smoothly the late reflections blend.',
    meta: [
      { label: 'DAW name', value: 'Diffusion' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '0 … 1' },
      { label: 'Default', value: '0.5' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Higher is a denser cloud. Lower leaves more separate repeats in the tail. It does not change how long the tail lasts.',
          },
        ],
      },
    ],
  }),

  preDiff: infoDoc({
    name: 'Pre Diff',
    lead: 'Softens the moment the late wash starts.',
    meta: [
      { label: 'DAW name', value: 'Pre Diffuse' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '0 … 1' },
      { label: 'Default', value: '0.35' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Higher smears the entrance into the late reverb. The early reflections stay sharp. Quality Lo forces this off and keeps the knob’s value stored. Mid uses 4 stages, Hi uses 6. The chart draws the amount as an attack, up to 80 ms, and draws 0 on Lo.',
          },
        ],
      },
    ],
  }),

  predelay: infoDoc({
    name: 'Predelay',
    lead: 'Sets the silence before the late wash. The early reflections are not delayed by this.',
    meta: [
      { label: 'DAW name', value: 'Predelay' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Range', value: '0 … 500 ms' },
      { label: 'Default', value: '20 ms' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'These are real milliseconds. More of it leaves the note in front of the hall. Less glues the wash to the note. Distance can add up to 40 ms on top. The chart shows that sum, and dragging the chart writes this knob with the distance taken back out.',
          },
        ],
      },
    ],
  }),

  chart: infoDoc({
    name: 'Room',
    lead: 'Shows the early level, the late level, and when the late wash starts.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'The late start is Predelay plus the distance addition. The attack drawn into that start is Pre Diff, up to 80 ms on the display, or nothing on Quality Lo. Dragging the start writes Predelay. The picture is not a measured impulse of the tank.',
          },
        ],
      },
    ],
  }),

  erMode: infoDoc({
    name: 'ER Mode',
    lead: 'Chooses the early reflections, the first bounces before the wash.',
    meta: [
      { label: 'DAW name', value: 'ER Mode' },
      { label: 'Parameter ID', value: '17' },
      { label: 'Stored range', value: '0…2. The buttons send Off 0, Multi-Tap 1, Velvet 2.' },
      { label: 'Default', value: '1 (Multi-Tap)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Off leaves only the late wash. In Serial, the late path then takes the filtered input directly.',
              'Multi-Tap is the clearer early hits. Lo keeps at most 12 of them. Mid and Hi use up to 32.',
              'Velvet is a denser early cloud. Lo keeps at most 24 taps. Mid and Hi use up to 62.',
            ],
          },
        ],
      },
    ],
  }),

  path: infoDoc({
    name: 'Path',
    lead: 'Chooses whether the early reflections sit beside the late wash or feed it.',
    meta: [
      { label: 'DAW name', value: 'Path' },
      { label: 'Parameter ID', value: '19' },
      { label: 'Stored range', value: '0…1. The buttons send Parallel 0, Serial 1.' },
      { label: 'Default', value: '0 (Parallel)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Parallel mixes the two. Serial sends the early reflections into the late reverb, so the wash starts from those bounces. ER Level and Late Level still set how loud each part is in the output. With early reflections off, Serial feeds the late path from the filtered input, the same as Parallel.',
          },
        ],
      },
    ],
  }),

  erLevel: infoDoc({
    name: 'ER Level',
    lead: 'Sets how loud the early reflections are.',
    meta: [
      { label: 'DAW name', value: 'ER Level' },
      { label: 'Parameter ID', value: '18' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '−6 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Up, and the first bounces sit forward. Down, and you mostly hear the late wash. It does nothing you can hear while ER Mode is Off. Wet is applied after this.',
          },
        ],
      },
    ],
  }),

  lateLevel: infoDoc({
    name: 'Late Level',
    lead: 'Sets how loud the late wash is, before Wet.',
    meta: [
      { label: 'DAW name', value: 'Late Level' },
      { label: 'Parameter ID', value: '20' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'This is the tail relative to the early reflections. Wet then turns the whole reverb, early and late, up or down together.',
          },
        ],
      },
    ],
  }),

  hfDamp: infoDoc({
    name: 'HF Damp',
    lead: 'Sets how quickly the late tail loses brightness.',
    meta: [
      { label: 'DAW name', value: 'HF Damp' },
      { label: 'Parameter ID', value: '14' },
      { label: 'Range', value: '2 000 … 20 000 Hz' },
      { label: 'Default', value: '5 000 Hz' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'This is a low-pass in the late loop. Lower, and the repeats get darker as they go. It does not filter the dry signal, and it is not the feed filter.',
          },
        ],
      },
    ],
  }),

  lfDamp: infoDoc({
    name: 'LF Damp',
    lead: 'Thins the bass in the late loop.',
    meta: [
      { label: 'DAW name', value: 'LF Damp' },
      { label: 'Parameter ID', value: '15' },
      { label: 'Range', value: '0 … 1' },
      { label: 'Default', value: '0.2' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 the bass stays in the feedback. At 1 a high-pass at 400 Hz is in the loop, so the tail loses weight. The corner moves from 40 Hz at 0 up to 400 Hz. The dry signal is not this filter.',
          },
        ],
      },
    ],
  }),

  air: infoDoc({
    name: 'Air',
    lead: 'Adds a high shelf on the wet reverb, after the early and late parts are mixed.',
    meta: [
      { label: 'DAW name', value: 'Air' },
      { label: 'Parameter ID', value: '16' },
      { label: 'Range', value: '0 … 1' },
      { label: 'Default', value: '0.25' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Higher is brighter on the wet output. The shelf sits at 6 kHz. Distance adds some of the same lift even when this is low. It is not Pre Diff, and it is not on the dry signal.',
          },
        ],
      },
    ],
  }),

  modRate: infoDoc({
    name: 'Mod Rate',
    lead: 'Sets how fast the late delays drift.',
    meta: [
      { label: 'DAW name', value: 'Mod Rate' },
      { label: 'Parameter ID', value: '21' },
      { label: 'Range', value: '0.05 … 5 Hz' },
      { label: 'Default', value: '0.5 Hz' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Slow is a gentle movement in the tail. Fast starts to swirl. You hear it when Mod Depth is up. It is there to keep a long decay from ringing on one note.',
          },
        ],
      },
    ],
  }),

  modDepth: infoDoc({
    name: 'Mod Depth',
    lead: 'Sets how far those late delays move.',
    meta: [
      { label: 'DAW name', value: 'Mod Depth' },
      { label: 'Parameter ID', value: '22' },
      { label: 'Range', value: '0 … 1' },
      { label: 'Default', value: '0.35' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 the late times stay still, and a long decay can sound metallic. Higher loosens that. Too far and the tail wobbles in pitch.',
          },
        ],
      },
    ],
  }),

  widthMode: infoDoc({
    name: 'Width Mode',
    lead: 'Chooses how the wet image is widened. The dry signal is not widened.',
    meta: [
      { label: 'DAW name', value: 'Width Mode' },
      { label: 'Parameter ID', value: '23' },
      { label: 'Stored range', value: '0…3. The buttons send Dry 0, M/S 1, Haas 2, Decor 3.' },
      { label: 'Default', value: '0 (Dry)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Dry leaves the wet image as the reverb made it. Width does nothing.',
              'M/S changes the side against the centre.',
              'Haas offsets one side by up to 5 ms. At Width 1 the offset is 0. Toward 0 or 2 it grows, and the late side swaps when you pass 1.',
              'Decor runs an allpass on the side and leaves the centre clearer.',
            ],
          },
        ],
      },
    ],
  }),

  width: infoDoc({
    name: 'Width',
    lead: 'Sets how wide that wet image is.',
    meta: [
      { label: 'DAW name', value: 'Width' },
      { label: 'Parameter ID', value: '24' },
      { label: 'Range', value: '0 … 2' },
      { label: 'Default', value: '1' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: '1 is the natural amount for the mode. Below that narrows the wet signal. Above that widens it. Ignored while Width Mode is Dry. A wide Haas can hollow out when the mix is summed to mono.',
          },
        ],
      },
    ],
  }),

  duck: infoDoc({
    name: 'Duck',
    lead: 'Turns the wet reverb down while the dry signal is loud.',
    meta: [
      { label: 'DAW name', value: 'Duck' },
      { label: 'Parameter ID', value: '25' },
      { label: 'Range', value: '0 … 1' },
      { label: 'Default', value: '0' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 it is off. Raise it and a loud note pushes the hall back, then the hall returns. The follower opens in about 20 ms and lets go in about 180 ms. Those times are fixed. At 1, a peak around −8 dB can take the wet level to silence. Dry is not ducked.',
          },
        ],
      },
    ],
  }),

  gate: infoDoc({
    name: 'Gate',
    lead: 'Opens the wet reverb on dry hits, then closes it.',
    meta: [
      { label: 'DAW name', value: 'Gate' },
      { label: 'Parameter ID', value: '26' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Off, the wash decays on its own. On, the wet path waits for the dry signal to cross the threshold, stays open for the hold, then closes. Dry is not gated.',
          },
        ],
      },
    ],
  }),

  gateThresh: infoDoc({
    name: 'Threshold',
    lead: 'Sets how loud the dry signal has to be to open the gate.',
    meta: [
      { label: 'DAW name', value: 'Gate Thresh' },
      { label: 'Parameter ID', value: '27' },
      { label: 'Range', value: '−60 … 0 dB' },
      { label: 'Default', value: '−24 dB' },
    ],
    sections: [
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Closer to 0 and only the strong hits open the hall. Lower, and quieter notes open it too. You only hear it while Gate is on.',
          },
        ],
      },
    ],
  }),

  gateHold: infoDoc({
    name: 'Hold',
    lead: 'Sets how long the gate stays open after the dry signal falls back under the threshold.',
    meta: [
      { label: 'DAW name', value: 'Gate Hold' },
      { label: 'Parameter ID', value: '28' },
      { label: 'Range', value: '1 … 500 ms' },
      { label: 'Default', value: '50 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'These are real milliseconds. Longer lets more of the tail through before the close. A new hit above the threshold starts the hold again.',
          },
        ],
      },
    ],
  }),

  gateRelease: infoDoc({
    name: 'Release',
    lead: 'Sets how quickly the gate closes after the hold.',
    meta: [
      { label: 'DAW name', value: 'Gate Release' },
      { label: 'Parameter ID', value: '29' },
      { label: 'Range', value: '5 … 2000 ms' },
      { label: 'Default', value: '120 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'These are real milliseconds. Short is a hard chop. Long is a fade. The scale mark at 1000 is one second.',
          },
        ],
      },
    ],
  }),

  freeze: infoDoc({
    name: 'Freeze',
    lead: 'Stops new audio from entering the late reverb and holds the wash that is already there.',
    meta: [
      { label: 'DAW name', value: 'Freeze' },
      { label: 'Parameter ID', value: '30' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The late loop no longer takes the input. What is in it keeps ringing, with the feedback just under full, so it fades extremely slowly rather than sitting forever. Early reflections and Dry still follow the playing. Turn it off and Decay applies to that held wash again.',
          },
        ],
      },
    ],
  }),

  dry: infoDoc({
    name: 'Dry',
    lead: 'Sets the level of the signal that is not reverbed.',
    meta: [
      { label: 'DAW name', value: 'Dry' },
      { label: 'Parameter ID', value: '31' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'This path skips predelay, the feed filter, and the room. Duck and Gate do not turn it down. It is separate from the header In and Out gains.',
          },
        ],
      },
    ],
  }),

  wet: infoDoc({
    name: 'Wet',
    lead: 'Sets the level of the whole reverb, early and late together, after width.',
    meta: [
      { label: 'DAW name', value: 'Wet' },
      { label: 'Parameter ID', value: '32' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '−12 dB' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'ER Level and Late Level set the balance inside this. Duck and Gate turn this level down. Active off takes it to silence. Turning it to −60 does not clear a tank that is still running.',
          },
        ],
      },
    ],
  }),
} as const;

export const reverbFeedInfo: FrequencyRangeInfo = {
  listen: infoDoc({
    name: 'Listen',
    lead: 'Lets you hear the filtered feed into the reverb, instead of the room.',
    meta: [
      { label: 'DAW name', value: 'Listen' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The signal after the high-pass and low-pass, before early reflections and the late wash. Use it to check that the room is being fed the part you mean. Dry, Wet, Duck, and Gate are not in this solo.',
          },
        ],
      },
    ],
  }),
  hipass: infoDoc({
    name: 'Highpass',
    lead: 'Sets the bottom of what is allowed into the early reflections and the late wash.',
    meta: [
      { label: 'DAW name', value: 'HP Freq' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '300 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'The dry signal is not filtered. Raise it when the room is carrying kick and bass. The slope has to be above Off or this corner is not in the feed. The default slope is 12 dB/oct.',
          },
        ],
      },
    ],
  }),
  lopass: infoDoc({
    name: 'Lowpass',
    lead: 'Sets the top of what is allowed into the early reflections and the late wash.',
    meta: [
      { label: 'DAW name', value: 'LP Freq' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '5 000 Hz' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'This is the entrance, not HF Damp. HF Damp darkens the tail as it recirculates. This decides what gets in. The default slope is 12 dB/oct.',
          },
        ],
      },
    ],
  }),
  hpMode: infoDoc({
    name: 'Highpass slope',
    lead: 'Sets how steep the feed high-pass is. Off means the lows stay in the room.',
    meta: [
      { label: 'DAW name', value: 'HP Mode' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Stored range', value: '0…4. The buttons send Off, 12, 24, 36, 48 dB/oct.' },
      { label: 'Default', value: '1 (12 dB/oct)' },
    ],
  }),
  lpMode: infoDoc({
    name: 'Lowpass slope',
    lead: 'Sets how steep the feed low-pass is. Off means the top stays in the room.',
    meta: [
      { label: 'DAW name', value: 'LP Mode' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Stored range', value: '0…4. The buttons send Off, 12, 24, 36, 48 dB/oct.' },
      { label: 'Default', value: '1 (12 dB/oct)' },
    ],
  }),
};
