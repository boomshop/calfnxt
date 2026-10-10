/** Hover titles for Expander controls (musicians / producers). */

import type { FrequencyRangeInfo } from '../../widgets/FrequencyRange/frequencyRangeInfo';
import { infoDoc } from '../../widgets/WithInfo/infoDoc';

const slopeStored =
  '0…4. The buttons send Off 0, 12 dB 1, 24 dB 2, 36 dB 3, 48 dB 4.';

export const expanderInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Lets the signal through with no expansion, so you can compare the processed sound with the untouched one.',
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
            p: 'Turn it on and listen. You should hear the part without the gate. Turn it off and the expander is back. Use that to decide whether the gaps got cleaner, or whether the body of the note is being eaten.',
          },
          {
            p: 'When the short fade has finished, the GR meter sits at 0. If GR is still moving, the fade is not done yet.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'While it is on, the header In and Out gains are unity. They are not added on top.',
              'The expander path fades out over a few milliseconds. After that fade, what you hear is the signal from before expansion.',
              'Listen does not replace the output while Bypass is on.',
            ],
          },
        ],
      },
    ],
  }),

  channel: infoDoc({
    name: 'Channel',
    lead: 'Chooses which part of the stereo signal the expander works on. The same choice is what it listens to.',
    meta: [
      { label: 'DAW name', value: 'Channel' },
      { label: 'Parameter ID', value: '40' },
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
              'Stereo works on both sides, and both sides get the same gain. Link decides whether the louder side, the average, or the centre sets that gain.',
              'Left or Right turns down that side only. The other side stays as it is.',
              'Mid turns down the centre. The wide part stays as it is.',
              'Side turns down the wide part. The centre stays as it is.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'An external sidechain is read through the same choice. The Inhibit buses are separate inputs. Channel does not retarget them.',
              'With Left, Right, Mid, or Side, the detector is already one signal, so Link barely changes anything.',
            ],
          },
        ],
      },
    ],
  }),

  sidechainActive: infoDoc({
    name: 'Sidechain',
    lead: 'Makes the expander listen to another input when deciding whether to open. The sound you hear stays the main signal.',
    meta: [
      { label: 'DAW name', value: 'Sidechain' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Route the track that should open the gate into the sidechain input, then turn this on. A drum can open a gate on a room mic. The room stays down until that drum arrives.',
          },
          {
            p: 'This key tries to open the expander. Inv 1 and Inv 2 are the opposite: they can force it closed. If nothing is routed, detection falls back to the main signal. Turn Listen on if you are not sure which signal you are hearing.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The external input is used only when this is on, the host provides that bus, and the bus is active. A mono sidechain is copied to both sides. The filters, Mode, Link, and Channel act on whatever the detector is hearing.',
          },
        ],
      },
    ],
  }),

  listen: infoDoc({
    name: 'Listen',
    lead: 'Lets you hear what the detector is using to decide whether the expander should be open.',
    meta: [
      { label: 'DAW name', value: 'Listen' },
      { label: 'Parameter ID', value: '18' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The main input, or the external sidechain if that input is active, after the filters above. Channel picks which part of the picture that is. While this is on, the expander is not in the sound.',
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Turn it on and check that the solo is the thing that should open the gate. Then turn it off and judge the gated signal. Only one Listen is on at a time. Leaving this panel turns it off.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Listen does nothing while Bypass is on. If an Inv Listen is also on, that inhibit solo wins and this one is not what you hear.',
          },
        ],
      },
    ],
  }),

  mode: infoDoc({
    name: 'Mode',
    lead: 'Sets how the expander measures the level that opens and closes it: on the instant spike, on a short average, or more gently once it is already closed.',
    meta: [
      { label: 'DAW name', value: 'Mode' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Stored range', value: '0…2. The buttons send Peak 0, RMS 1, Opto 2.' },
      { label: 'Default', value: '1 (RMS)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Peak follows the loudest instant. A short hit can open the gate. Use it when the transient is what should open, and you accept that a click can do it.',
              'RMS follows a short average, so the body of the sound opens the gate more than one click. A spike on its own moves it less.',
              'Opto gets slower to move once the signal is already turned down. The gate settles instead of chopping every peak. This is a generic behaviour, not a copy of a particular optical unit.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'Attack and Release ease this measured level. The gain then follows the curve at once. They do not ease the gain after the curve, the way the compressor’s Peak and RMS modes do.',
              'In RMS the average rises with Attack and falls with Release. It is not a fixed window.',
              'In Opto, the deeper the reduction already is, the slower the measured level rises and the slower it falls.',
            ],
          },
        ],
      },
    ],
  }),

  link: infoDoc({
    name: 'Link',
    lead: 'Chooses which of the two detector channels sets the gain. On Stereo, both sides still receive that same gain.',
    meta: [
      { label: 'DAW name', value: 'Link' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Stored range', value: '0…2. The buttons send Max 0, Avg 1, Mid 2.' },
      { label: 'Default', value: '0 (Max)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Max follows the louder side. A hit on one side can open both, so the picture does not open on one side only.',
              'Avg follows the average of both sides. One loud side opens the gate less hard than it would on Max.',
              'Mid follows only the centre. A loud side does not open the gate by itself. Both sides still get the same gain. The wide part is not left ungated.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'When Channel is not Stereo, both detector channels already carry that one signal, so the three settings behave the same.',
          },
        ],
      },
    ],
  }),

  threshold: infoDoc({
    name: 'Threshold',
    lead: 'Sets how loud the signal has to get before the expander opens and leaves it alone.',
    meta: [
      { label: 'DAW name', value: 'Threshold' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '−60 … 0 dB' },
      { label: 'Default', value: '−32 dB' },
      { label: 'Display', value: 'Two decimal places on the knob.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Above this level the signal is left at unity. Below it, the expander pushes the level further down, toward the Range floor. Raise it and more of the phrase is treated as a gap. Lower it and more of the body stays open.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Play the note you want to keep and the gap you want down. Raise Threshold until the gap moves the GR meter and the note still returns the meter to 0. If the body of the note is also turned down, the threshold is above that note. Lower it until the note sits open and only the quieter part closes.',
          },
        ],
      },
      {
        heading: 'On the graph',
        blocks: [
          {
            p: 'The transfer graph draws this as the point where the line becomes a diagonal. Above it, input and output match. Below it, the line falls away. The history draws it as a dashed line while you are on the Detector panel.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'Knee sits entirely below this level. It does not start the reduction above the threshold.',
              'Rel Thresh cannot be set above this. If you lower Threshold past Rel Thresh, Rel Thresh comes down with it.',
              'Ratio at 1:1 does not push the level down, at any threshold. Range at 0 dB cannot turn the signal down either.',
            ],
          },
        ],
      },
    ],
  }),

  releaseThreshold: infoDoc({
    name: 'Rel Thresh',
    lead: 'Sets the lower level the detector must fall to before the expander is allowed to close.',
    meta: [
      { label: 'DAW name', value: 'Rel Thresh' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '−60 … 0 dB, and never above Threshold' },
      { label: 'Default', value: '−32 dB' },
      { label: 'Display', value: 'Two decimal places on the knob.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The expander opens at Threshold. It does not close again until the level falls below this. A gap between the two stops a signal that is hovering on the threshold from opening and closing on every wobble.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Turn Rel Thresh Active on, then set this a little below Threshold. If the gate still chatters on a decaying note, lower this further. If the gate then stays open through a gap you wanted closed, it is further below the note than that gap. Hold is the other control for that: it waits after this level is crossed, instead of moving the level.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'With Rel Thresh Active off, this knob is ignored and the close level is Threshold.',
              'While the expander is closed, the curve uses this level instead of Threshold.',
              'Hold starts only after the detector has fallen below this close level.',
            ],
          },
        ],
      },
    ],
  }),

  relThreshActive: infoDoc({
    name: 'Rel Thresh Active',
    lead: 'Turns the separate close threshold on. Off means the expander closes at the same level it opened.',
    meta: [
      { label: 'DAW name', value: 'Rel Thresh Active' },
      { label: 'Parameter ID', value: '19' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Leave it off when one level is enough: above Threshold the gate is open, below it the gate can close. Turn it on when a note is flickering around that one level and you want it to stay open until the level has fallen further.',
          },
        ],
      },
    ],
  }),

  ratio: infoDoc({
    name: 'Ratio',
    lead: 'Sets how far a level below the threshold is pushed down.',
    meta: [
      { label: 'DAW name', value: 'Ratio' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '1 … 20, shown as n:1' },
      { label: 'Default', value: '4:1' },
      { label: 'Display', value: 'One decimal place on the knob.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'This is the opposite of a compressor ratio. 1:1 leaves the level alone. 2:1 means a moment that sits 1 dB under the threshold comes out about 2 dB under. 4:1 means about 4 dB under for every 1 dB under. Higher numbers drop the quiet part faster. Range stops the drop.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Raise it until the gap is as far down as you want and the note you meant to keep is still open. If the tail of that note is being shoved down with the gap, the ratio is steep for a threshold that is already catching the tail. Lower the ratio, or lower the threshold, until the tail belongs to the note again.',
          },
        ],
      },
      {
        heading: 'On the graph',
        blocks: [
          {
            p: 'Below the open point, a higher ratio is a steeper fall. The line cannot fall past Range.',
          },
        ],
      },
    ],
  }),

  knee: infoDoc({
    name: 'Knee',
    lead: 'Rounds the opening and the landing on the Range floor, instead of hard corners.',
    meta: [
      { label: 'DAW name', value: 'Knee' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '0 … 24 dB' },
      { label: 'Default', value: '6 dB' },
      { label: 'Display', value: 'Two decimal places on the knob.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 the expander is either open or on the full ratio, with the change at the threshold. Raise it and the level eases into the drop, and eases into the floor, instead of stepping. The start of the close is less obvious.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'The open knee sits entirely below Threshold. Its width is the knob. At the default of 6 dB, the full ratio starts 6 dB below Threshold and eases up to unity at Threshold.',
              'The corner into the Range floor uses half that width.',
              'This is not centred on the threshold the way the compressor knee is.',
            ],
          },
        ],
      },
    ],
  }),

  attack: infoDoc({
    name: 'Attack',
    lead: 'Sets how quickly the measured level rises when the signal gets louder, which is how fast the expander can open.',
    meta: [
      { label: 'DAW name', value: 'Attack' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Range', value: '0.1 … 500' },
      { label: 'Default', value: '5' },
      { label: 'Display', value: 'One decimal place. No unit: this is not a clock time in milliseconds.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A lower number opens on the hit. The start of the note gets through. A higher number waits, so a short spike may not open the gate, and the start of a real note stays turned down until the level has been loud for longer.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'If the click you want is missing and GR is still up at the start of the hit, lower this. If a bleed spike is opening the gate, raise it until that spike no longer opens it and the hit you want still does. Double the number and the rise is about twice as slow.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'This eases the measured level on the way up. The gain follows the curve immediately. It does not let a transient through the way a slow compressor attack does.',
              'About a quarter of the number is the time constant in real milliseconds. At the fastest end that gets less exact.',
            ],
          },
        ],
      },
    ],
  }),

  hold: infoDoc({
    name: 'Hold',
    lead: 'Keeps the expander open for this long after the level has fallen below the close threshold, before it is allowed to close.',
    meta: [
      { label: 'DAW name', value: 'Hold' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Range', value: '0 … 500 ms' },
      { label: 'Default', value: '0 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 the expander can start closing as soon as the level crosses the close threshold. Raise it and a short gap in the middle of a note does not close the gate. The note stays open through that gap.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'If the gate chatters in the tail of a note, raise Hold until the tail stays open. If the next gap you wanted closed is still open, Hold is longer than that gap. This is a real time in milliseconds. It does not change Release.',
          },
        ],
      },
    ],
  }),

  release: infoDoc({
    name: 'Release',
    lead: 'Sets how quickly the measured level falls once the expander is allowed to close.',
    meta: [
      { label: 'DAW name', value: 'Release' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Range', value: '1 … 2000' },
      { label: 'Default', value: '120' },
      { label: 'Display', value: 'Whole numbers. No unit: this is not a clock time in milliseconds.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A lower number drops the gain quickly after Hold. The gap goes quiet fast, and the close can sound like a cut. A higher number eases down. The tail hangs open longer.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Listen to the moment the note ends. If the close clicks or chops the tail, raise it. If the gap stays half-open and the next noise is still audible, lower it. Double the number and the fall is about twice as slow. This is the same speed scale as Attack, not the milliseconds on Hold or on the Inv release.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'About a quarter of the number is the time constant in milliseconds. The gain follows the falling level at once. It does not wait behind a second smoother.',
          },
        ],
      },
    ],
  }),

  range: infoDoc({
    name: 'Range',
    lead: 'Sets the deepest the expander can turn the signal down.',
    meta: [
      { label: 'DAW name', value: 'Range' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Range', value: '−90 … 0 dB' },
      { label: 'Default', value: '−60 dB' },
      { label: 'Display', value: 'Two decimal places on the knob.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 dB means the expander cannot turn the signal down, whatever Ratio is. More negative means a fully closed gate is quieter. At the default of −60 dB, a closed gate is 60 dB down. −90 dB is close to silence.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Set it for how quiet the gap should be, not for which notes close. If the gap is still audible, go more negative. If a note you wanted open is being pushed all the way to this floor, the threshold or the ratio is catching that note. Range is only the bottom.',
          },
        ],
      },
      {
        heading: 'On the graph',
        blocks: [
          {
            p: 'The transfer curve cannot fall further than this many dB below the input. An Inv key can still force the gain to this same floor. That force is on the GR meter, not on the dot.',
          },
        ],
      },
    ],
  }),

  gr: infoDoc({
    name: 'GR',
    lead: 'Shows how many decibels the expander is turning the signal down right now. It is a meter, not a control.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: '0 means the gate is open. A higher number means more reduction, up to 60 dB on the scale, with marks at 1, 3, 6, and 12. A jump in a gap is the close doing its job. A number that stays up through the note means that note is being gated.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The meter follows the gain that is actually applied, including an Inv key forcing the floor. It does not keep a peak. Full bypass forces it to 0.',
          },
        ],
      },
    ],
  }),

  history: infoDoc({
    name: 'History',
    lead: 'Shows the last 8 seconds of the level the expander is working on, and how far it is turning that level down.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            ul: [
              'One fill is the level before the gain change. The other is the level after it. Where they separate, that gap is the reduction.',
              'On the Detector panel the dashed line is Threshold. On an Inv panel it is that Inv threshold.',
              'Trig and GR are off until you turn them on. GR is the gain itself: 0 dB when nothing is turned down, and down by the amount being reduced. Trig is the level the detector is hearing.',
              'When an Inv is armed, its hold can be shown as its own trace.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: '0 dB stays at the top. The bottom of the scale follows the level, in 6 dB steps, and does not go below −60 dB. Makeup is not part of this plug-in. The picture is the selected path after the expander gain.',
          },
        ],
      },
    ],
  }),

  transfer: infoDoc({
    name: 'Transfer',
    lead: 'Shows the expander’s working curve: open above the threshold, and pushed down below it.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            ul: [
              'Across is the detector level. Up is the level after the curve.',
              'Above Threshold the line is a diagonal: the level is left alone. Below it the line falls, steeper as Ratio goes up, and stops at Range.',
              'The dot is where the detector level sits on that curve right now.',
            ],
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Play the note and the gap. The dot should sit on the diagonal for the note and down the slope for the gap. If the note is already on the slope, Threshold is above that note.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'The handles edit Threshold, Ratio, and Rel Thresh.',
              'The dot follows the expander curve only. An Inv key can pull the real gain further down. That shows on the GR meter, not as the dot leaving the line.',
              'While Bypass has finished fading, the dot sits on the diagonal.',
            ],
          },
        ],
      },
    ],
  }),

  panelDetector: infoDoc({
    name: 'Detector',
    lead: 'This is the key that tries to open the expander. Filters, Mode, Link, and the external sidechain live here.',
    sections: [
      {
        heading: 'How it sits with Inv',
        blocks: [
          {
            p: 'Inv 1 and Inv 2 do not open the gate. They can force it closed when their own key is louder than this detector. Use this panel to choose what should keep the gate open.',
          },
        ],
      },
    ],
  }),

  panelInv1: infoDoc({
    name: 'Inv 1',
    lead: 'A key that can force the expander closed. It never opens the gate.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Route a competing track to the host’s Inhibit 1 input. Arm the key on this panel. When that key is louder than the main detector, the expander is pulled toward Range. When the main detector is as loud or louder, this key does not close it. A real hit together with the competing hit stays open. The competing hit on its own can close the gate.',
          },
          {
            p: 'The LED means this key is armed. The tab highlights while the key is actually holding the gate shut. Leaving the panel turns Listen off.',
          },
        ],
      },
    ],
  }),

  panelInv2: infoDoc({
    name: 'Inv 2',
    lead: 'A second key that can force the expander closed, with the same law as Inv 1.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Route another competing track to Inhibit 2. It closes only when this key outranks the main detector. It does not open the gate. The two Inv keys are independent: the stronger hold wins.',
          },
        ],
      },
    ],
  }),

  invActive: infoDoc({
    name: 'Active',
    lead: 'Arms this inhibit key. Off means that input cannot close the gate.',
    meta: [
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Turn it on only after the competing track is routed to this Inhibit input. With no route, arming does nothing. Listen still works while this is off, so you can tune the filters before the key is allowed to close the gate.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Inv 1 Active is parameter 20, DAW name Inv 1 Active. Inv 2 Active is parameter 30, DAW name Inv 2 Active. The same control is on both panels.',
          },
        ],
      },
    ],
  }),

  invGain: infoDoc({
    name: 'Gain',
    lead: 'Turns this inhibit key up or down before it is compared with the main detector.',
    meta: [
      { label: 'Range', value: '−24 … 24 dB' },
      { label: 'Default', value: '0 dB' },
      { label: 'Display', value: 'Two decimal places on the knob.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Raise it and this key wins more easily, so it closes the gate on quieter bleed. Lower it and the main detector wins more easily, so a real hit stays open. It does not add level to the output. You hear it only as extra closing.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'If bleed is still opening the gate, raise Gain until that bleed loses to this key. If the hit you wanted to keep now closes too, Gain is high enough that this key outranks the hit. Ease it back.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Inv 1 Gain is parameter 21, DAW name Inv 1 Gain. Inv 2 Gain is parameter 31, DAW name Inv 2 Gain. The trim is applied before the filters.',
          },
        ],
      },
    ],
  }),

  invThreshold: infoDoc({
    name: 'Thresh',
    lead: 'Sets how loud this inhibit key must be before it is allowed to compete at all.',
    meta: [
      { label: 'Range', value: '−60 … 0 dB' },
      { label: 'Default', value: '−24 dB' },
      { label: 'Display', value: 'Two decimal places on the knob.' },
    ],
    sections: [
      {
        heading: 'What it does',
        blocks: [
          {
            p: 'Below this level the key is ignored, even if it would otherwise be louder than the main detector. Use it so hiss and quiet bleed never enter the comparison. Once the key is above this floor, it still has to be louder than the main detector before it closes anything.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'If the key never closes the gate, lower this or raise Gain, and check with Listen that the competing hit is actually in this input. If the key closes on noise, raise this until only the hit you routed gets through.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'Full close takes the key about 6 dB louder than the main detector. From equal up to that 6 dB, the force eases in. Equal levels do not close the gate.',
              'Inv 1 Thresh is parameter 22, DAW name Inv 1 Thresh. Inv 2 Thresh is parameter 32, DAW name Inv 2 Thresh.',
            ],
          },
        ],
      },
    ],
  }),

  invHold: infoDoc({
    name: 'Hold',
    lead: 'Keeps a winning inhibit fully closed for this long after the key stops beating the main detector.',
    meta: [
      { label: 'Range', value: '0 … 500 ms' },
      { label: 'Default', value: '50 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'This covers the body of the competing hit, so the gate does not flicker open between the stick and the ring. 0 starts the fade as soon as the key loses. This is a real time in milliseconds, not the expander’s own Hold.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'If bleed pokes through during the competing hit, lengthen it. If the next real hit on this track stays closed after the competing hit has gone, it is longer than that gap.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Inv 1 Hold is parameter 23, DAW name Inv 1 Hold. Inv 2 Hold is parameter 33, DAW name Inv 2 Hold.',
          },
        ],
      },
    ],
  }),

  invRelease: infoDoc({
    name: 'Release',
    lead: 'Sets how fast the force-closed amount fades after Hold, in real milliseconds.',
    meta: [
      { label: 'Range', value: '1 … 2000 ms' },
      { label: 'Default', value: '120 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A short time lets the main detector reopen quickly once the competing hit is gone. The hand-off can click if Range is deep. A longer time eases the gate back open. This is not the expander’s own Release, and it is an actual time, not that speed scale.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Inv 1 Release is parameter 24, DAW name Inv 1 Release. Inv 2 Release is parameter 34, DAW name Inv 2 Release. The fade is a one-pole on the hold amount, with the time constant equal to this many milliseconds.',
          },
        ],
      },
    ],
  }),

  invListen: infoDoc({
    name: 'Listen',
    lead: 'Lets you hear this inhibit key after its Gain and filters, instead of the gated signal.',
    meta: [
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Turn it on and shape the filters until the solo is the competing hit, not the track you are gating. Then turn it off. It does not arm the key. Only one Listen is on at a time, and leaving this panel turns it off.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'Inv 1 Listen is parameter 29, DAW name Inv 1 Listen. Inv 2 Listen is parameter 39, DAW name Inv 2 Listen.',
              'If both Inv listens are stored on, Inv 1 is the one you hear. Listen does nothing while Bypass is on.',
            ],
          },
        ],
      },
    ],
  }),

  keyMeters: infoDoc({
    name: 'Key meters',
    lead: 'Shows the detector and any armed inhibit key, so you can set Inv without soloing.',
    sections: [
      {
        heading: 'How to read them',
        blocks: [
          {
            ul: [
              'Trig is the main detector after its filters, from −60 dB to 0 dB.',
              'I1 or I2 is that inhibit key after Gain and its filters, on the same scale. It appears only while that Inv is armed.',
              'H1 or H2 is how hard that key is forcing the gate shut. The bottom of the scale means it is not holding. The top, 0 dB, means it is fully forcing Range.',
            ],
          },
        ],
      },
      {
        heading: 'How to use them',
        blocks: [
          {
            p: 'Compare I with Thresh: if I never reaches the threshold, that key cannot compete. Compare H with the hit you want to keep: H should rise on the competing hit and sit at the bottom when the real hit is playing.',
          },
        ],
      },
    ],
  }),
} as const;

function detectorFilter(
  name: string,
  daw: string,
  id: string,
  lead: string,
  hear: string,
  detail: string,
): string {
  return infoDoc({
    name,
    lead,
    meta: [
      { label: 'DAW name', value: daw },
      { label: 'Parameter ID', value: id },
      { label: 'Stored range', value: slopeStored },
      { label: 'Default', value: '0 (Off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [{ p: hear }],
      },
      {
        heading: 'In detail',
        blocks: [{ p: detail }],
      },
    ],
  });
}

function freqFilter(
  name: string,
  daw: string,
  id: string,
  range: string,
  def: string,
  lead: string,
  hear: string,
): string {
  return infoDoc({
    name,
    lead,
    meta: [
      { label: 'DAW name', value: daw },
      { label: 'Parameter ID', value: id },
      { label: 'Range', value: range },
      { label: 'Default', value: def },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [{ p: hear }],
      },
    ],
  });
}

const filterDetail =
  'Off is a wire: the frequency knob does nothing. 12, 24, 36, and 48 dB/oct are one to four Butterworth stages. This filter is only on the key, so 36 dB is available.';

/** Detector FrequencyRange. Missing keys fall back to the shared widget text. */
export const expanderDetectorInfo: FrequencyRangeInfo = {
  listen: expanderInfo.listen,
  chart: infoDoc({
    name: 'Detector filter',
    lead: 'Shows the filter in front of the key that opens the expander. It does not filter the sound you hear, unless Listen is on.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'With both slopes on Off the line is flat and the detector hears the full signal. A dip on the left ignores lows. A dip on the right ignores highs. The defaults are Off, so this line starts flat.',
          },
        ],
      },
    ],
  }),
  hpMode: detectorFilter(
    'High-pass slope',
    'HP Mode',
    '16',
    'Sets how steeply the lows are removed from the key that opens the expander.',
    'Off means the detector hears the lows. A steeper slope lets a kick or a rumble open the gate less, and the mids and highs open it more. The output is unchanged until Listen is on.',
    filterDetail,
  ),
  hipass: freqFilter(
    'High-pass',
    'Highpass',
    '14',
    '20 … 20 000 Hz',
    '20 Hz',
    'Sets the frequency where the open-key starts to ignore the lows.',
    'Higher means more low end is left out of the detector. With the slope on Off, this frequency does nothing. The default is 20 Hz.',
  ),
  lopass: freqFilter(
    'Low-pass',
    'Lowpass',
    '15',
    '20 … 20 000 Hz',
    '20 000 Hz',
    'Sets the frequency where the open-key starts to ignore the highs.',
    'Lower means more top is left out of the detector. With the slope on Off, this frequency does nothing. The default is 20 kHz, so even a slope would barely cut.',
  ),
  lpMode: detectorFilter(
    'Low-pass slope',
    'LP Mode',
    '17',
    'Sets how steeply the highs are removed from the key that opens the expander.',
    'Off means the detector hears the highs. A steeper slope ignores bright hits more sharply. The output is unchanged until Listen is on.',
    filterDetail,
  ),
};

function invRangeInfo(slot: 1 | 2): FrequencyRangeInfo {
  const base = slot === 1 ? 25 : 35;
  const prefix = `Inv ${slot}`;
  return {
    listen: expanderInfo.invListen,
    chart: infoDoc({
      name: `${prefix} filter`,
      lead: `Shows the filter on the ${prefix} key. It does not filter the gated signal, unless Listen is on.`,
      sections: [
        {
          heading: 'What you see',
          blocks: [
            {
              p: 'Shape this until Listen is the competing hit. With both slopes on Off the key is full range. The defaults are Off, 20 Hz and 20 kHz.',
            },
          ],
        },
      ],
    }),
    hpMode: detectorFilter(
      'High-pass slope',
      `${prefix} HP Mode`,
      String(base + 2),
      'Sets how steeply the lows are removed from this inhibit key.',
      'A steeper slope keeps low rumble on this bus from closing the gate. The gated signal is unchanged until Listen is on.',
      filterDetail,
    ),
    hipass: freqFilter(
      'High-pass',
      `${prefix} Highpass`,
      String(base),
      '20 … 20 000 Hz',
      '20 Hz',
      'Sets where this inhibit key starts to ignore the lows.',
      'Higher leaves more low end out of the comparison. With the slope on Off, this does nothing.',
    ),
    lopass: freqFilter(
      'Low-pass',
      `${prefix} Lowpass`,
      String(base + 1),
      '20 … 20 000 Hz',
      '20 000 Hz',
      'Sets where this inhibit key starts to ignore the highs.',
      'Lower leaves more top out of the comparison. With the slope on Off, this does nothing.',
    ),
    lpMode: detectorFilter(
      'Low-pass slope',
      `${prefix} LP Mode`,
      String(base + 3),
      'Sets how steeply the highs are removed from this inhibit key.',
      'A steeper slope keeps brightness on this bus from closing the gate. The gated signal is unchanged until Listen is on.',
      filterDetail,
    ),
  };
}

export const expanderInv1Info = invRangeInfo(1);
export const expanderInv2Info = invRangeInfo(2);
