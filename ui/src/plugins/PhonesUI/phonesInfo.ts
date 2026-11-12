/** Hover titles for Phones controls. */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const phonesInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Sends the input through unchanged, with no crossfeed and no room.',
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
            p: 'While it is on, the header In and Out gains are unity. The crossfeed and the room reset, so turning it off starts from silence in the reflections rather than a leftover tail.',
          },
        ],
      },
    ],
  }),

  mono: infoDoc({
    name: 'Mono',
    lead: 'Sums the mix to mono before the triangle, so you hear how the centre holds up.',
    meta: [
      { label: 'DAW name', value: 'Mono' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Left and right are averaged, then that sum goes through Amount, the room, and the rest. A centred signal stays at the same level. Sides drop. The fade in and out is a few tens of milliseconds.',
          },
        ],
      },
    ],
  }),

  amount: infoDoc({
    name: 'Amount',
    lead: 'Blends the raw headphone feed with the speaker triangle.',
    meta: [
      { label: 'DAW name', value: 'Amount' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Range', value: '0…1' },
      { label: 'Default', value: '1' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 is the headphone as it is: each ear hears only its own channel. 1 is the full triangle at the current Angle and Distance, including the room. In between, the centre starts to leave the head while the edges are still partly in the ears.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'A mono signal stays at the same level at every Amount when Room is 0. The low band that crosses to the other ear is taken off the near ear by the same amount, so the centre does not get louder.',
          },
        ],
      },
    ],
  }),

  angle: infoDoc({
    name: 'Angle',
    lead: 'Sets how wide the two speakers stand, as the half-angle at your head.',
    meta: [
      { label: 'DAW name', value: 'Angle' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '±20° … ±45°' },
      { label: 'Default', value: '±30°' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '±30° is the equal-sided triangle. Narrower pulls the image together and lets more treble cross. Wider opens the image and darkens the far speaker. The drawing marks this half-angle from the centre line to one speaker.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The delay to the far ear follows the angle, about 0.18 ms at ±20°, 0.26 ms at ±30°, and 0.38 ms at ±45°. The shadow on the crossfeed is a one-pole low-pass, about 1.1 kHz when the speakers are close together and about 450 Hz when they are wide. Distance barely changes that delay.',
          },
        ],
      },
    ],
  }),

  distance: infoDoc({
    name: 'Distance',
    lead: 'Sets how far the speakers are from you, and grows the room so you still fit.',
    meta: [
      { label: 'DAW name', value: 'Distance' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '0.50 … 4.00 m' },
      { label: 'Default', value: '1.20 m' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Closer is drier, because the walls stay further behind the direct sound. Further away, the same walls arrive sooner after the speakers and sit louder against them. The angle, and with it the delay between your ears, stays put.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Below about a metre the far ear is a little quieter as well, because the path around the head is a larger part of the short distance. From about 1 m out that extra drop is gone. The label on the speaker line is this distance.',
          },
        ],
      },
    ],
  }),

  room: infoDoc({
    name: 'Room',
    lead: 'Sets how loud the walls are. It does not move them.',
    meta: [
      { label: 'DAW name', value: 'Room' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '0…1' },
      { label: 'Default', value: '0.5' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 is the dry triangle: crossfeed only. Higher brings in the first wall bounces and a short tail. The dashed lines in the drawing are the side-wall bounces, and they fade with this knob.',
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Leave enough in that the speakers sit in a room, and little enough that the reverb already in the mix is still the one you judge. The walls add level on top of the dry signal, so a loud Room is no longer the flat centre you get at 0.',
          },
        ],
      },
    ],
  }),

  live: infoDoc({
    name: 'Live',
    lead: 'Opens the room from a tight control room toward a small living room.',
    meta: [
      { label: 'DAW name', value: 'Live' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '0…1' },
      { label: 'Default', value: '0 (control room)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 keeps the walls close around the triangle and the decay near 0.25 s. 1 pushes the walls out and lengthens the decay to about 0.45 s. It does not become a hall. You only hear the change while Room is up; the drawing moves either way.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Side gap is 0.25 m plus 0.85 m times Live. Front gap is 0.30 m plus 0.50 m times Live. The gap behind you is 0.40 m plus 1.10 m times Live. The number in the corner is the decay target. A larger Distance does not push that decay any further.',
          },
        ],
      },
    ],
  }),

  plan: infoDoc({
    name: 'Plan',
    lead: 'Top view of the triangle and the room the sound is using.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: 'You are the dot at the bottom, looking up the dashed centre line. The two marks are the speakers. The arc is Angle, the label on the line to the right speaker is Distance. The frame is the room. Live is the air between the speakers and the walls, and the decay time in the corner. The dashed curves are the side-wall bounces, drawn only as loud as Room.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Amount, Mono, and Bypass do not move the drawing. They do not change a position. The figure is always the layout of Angle, Distance, and Live.',
          },
        ],
      },
    ],
  }),
};
