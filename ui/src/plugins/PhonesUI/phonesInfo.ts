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
            p: 'Left and right are averaged, then that sum goes through the triangle. A centred signal stays at the same level. Sides drop.',
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
            p: '0 is the headphone as it is. 1 is the triangle at the current Angle and Distance, including the room.',
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
            p: 'Closer is drier: the speakers stay loud and the room sits further behind them. Further away, the same walls become a larger part of what you hear. The delay between your ears barely moves. That still belongs to Angle.',
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
            p: '0 is the dry triangle: crossfeed only. Higher brings in the wall cloud and a short tail. The dashed lines in the drawing are the side-wall bounces, and they fade with this knob.',
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
    lead: 'Opens the gaps between you, the speakers, and the walls.',
    meta: [
      { label: 'DAW name', value: 'Live' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '0…1' },
      { label: 'Default', value: '0.25' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 keeps the walls close around the triangle and the decay near 0.25 s. 1 pushes the walls out and lengthens the decay to about 0.45 s. It does not furnish the room and it does not become a hall. You only hear the change while Room is up; the drawing moves either way.',
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

  scatter: infoDoc({
    name: 'Scatter',
    lead: 'Breaks the bare rectangle into something more like a furnished room.',
    meta: [
      { label: 'DAW name', value: 'Scatter' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Range', value: '0…1' },
      { label: 'Default', value: '0.40' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '0 is the even room: the same walls, a bit of fill so it is not a bare box. Higher stirs the walls and adds a few more late bounces. It stays this room. It does not open into a hall.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Live still sets how far the walls are, and how long the tail rings. Scatter only stirs that: a few centimetres of wall offset, a denser image cloud, and a slightly darker tail. The tail length does not grow with Scatter. The drawing shows the offset walls.',
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
            p: 'You are the head at the bottom, looking up the dashed centre line. The two cabinets are the speakers, turned toward you. The arc is Angle, the label on the line to the right speaker is Distance. Above the line that joins the cabinets, just right of the centre line, is how far apart the speakers stand. The frame is the room. Live is the air between the speakers and the walls, and the decay time in the corner.',
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Drag a cabinet sideways to set Angle. Drag the head up or down to set Distance. The knobs follow the drawing.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Amount, Mono, Room, and Bypass do not move the drawing. Scatter nudges the walls a little. The figure is otherwise the layout of Angle, Distance, and Live. The speaker spacing is the width of that triangle.',
          },
        ],
      },
    ],
  }),
};
