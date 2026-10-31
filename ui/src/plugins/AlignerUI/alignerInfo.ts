/** Hover titles for Aligner controls (session / producer tone). DSP-backed only. */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

/**
 * Global params: In/Out 0–1, then plugin params from 2.
 * Eight lane slots start at parameter 11. Each slot is 7 parameters:
 * Mute, Solo, Phase, Join, Delay, Gain, Pan.
 * Lane N is 11 + (N−1)×7 + offset.
 */
const laneId = (offset: number) =>
  `Lane 1 is parameter ${11 + offset}. Each next lane is 7 higher.`;

export const alignerInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'A/B the alignment: turns lane Delay, Phase, and Master Delay off while the mix (Gain, Pan, Mute, Solo, Volume) stays as set.',
    meta: [
      { label: 'DAW name', value: 'Bypass' },
      { label: 'Parameter ID', value: '2' },
      {
        label: 'Stored value',
        value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.',
      },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Skipped: lane Delay, Phase, and Master Delay. Still active: Gain, Pan, Mute, Solo, and Volume. Header In and Out gains are forced to unity while Bypass is on. Use it to hear the timing difference without changing the balance.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Phase rides with Delay because polarity flips are part of lining hits up, not of the stem mix. Reported latency is held so host PDC does not jump; the dry sum is delayed only by that held amount. Wave packs show undelayed, unflipped captures until Bypass is cleared.',
          },
        ],
      },
    ],
  }),

  waveSpan: infoDoc({
    name: 'Wave',
    lead: 'Zooms the hit strips around the locked Anchor transient. The lock always keeps up to 240 ms after the hit in the ring snapshot; this knob only chooses how much of that you see.',
    meta: [
      { label: 'DAW name', value: 'Wave' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Range', value: '24 … 240 ms' },
      { label: 'Default', value: '32 ms' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Narrower windows zoom in on the attack. Wider windows show more of the decay so you can compare ring and spill across lanes. Turning Wave re-crops the last lock immediately.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'A quarter of the visible span sits before the lock and three quarters after. x≈0 is the first half-period peak after armed/wait-rise (amplitude is compared only across zero-crossings). While later half-periods get louder, only the max is tracked; after a fall, the next rise locks again — except during a mute of about half the Wave span, so a wide window can show two hits without jumping. The previous pack stays on screen until the new Wave window is full, then one redraw replaces it.',
          },
        ],
      },
    ],
  }),

  analysis: infoDoc({
    name: 'Analyze',
    lead: 'Sets the HP/LP band used when Hit, Waves, or Corr have their filter toggles on. The audible mix is never filtered here.',
    meta: [
      { label: 'DAW names', value: 'Analysis HP, Analysis LP, Analysis HP Mode, Analysis LP Mode' },
      { label: 'Parameter IDs', value: '5 (HP Hz), 6 (LP Hz), 7 (HP slope), 8 (LP slope)' },
      { label: 'Frequency range', value: '20 … 20 000 Hz each' },
      { label: 'Frequency defaults', value: 'HP 40 Hz, LP 250 Hz' },
      {
        label: 'Slope',
        value:
          'Off / 12 / 24 / 48 dB (stored 0, 1, 2, 4). Default 24 dB on both sides. Same cascade as other calfNXT sidechain filters.',
      },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Shape the band for shared mic energy, then use the Hit / Waves / Corr toggles to choose which displays follow that band. A common setup is Hit on (lock to the shell) and Waves off (see the full transient).',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Each lane and the Reference always run through the cascade for the filtered taps. Raw taps are kept in parallel. The toggles only select which tap feeds each display path.',
          },
        ],
      },
    ],
  }),

  filterHit: infoDoc({
    name: 'Hit',
    lead: 'When on, the Analyze band feeds the transient detector that snaps the wave windows. When off, the detector listens to the full-band signal.',
    meta: [
      { label: 'DAW name', value: 'Filter Hit' },
      { label: 'Parameter ID', value: '67' },
      {
        label: 'Stored value',
        value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.',
      },
      { label: 'Default', value: '1 (on)' },
    ],
  }),

  filterWaves: infoDoc({
    name: 'Waves',
    lead: 'When on, lane strips and Master L/R show the Analyze band. When off, they show the full-band waveform (Reference and mix together).',
    meta: [
      { label: 'DAW name', value: 'Filter Waves' },
      { label: 'Parameter ID', value: '68' },
      {
        label: 'Stored value',
        value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.',
      },
      { label: 'Default', value: '1 (on)' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Fill and outline always share the same source so optical alignment stays fair. A new Anchor hit refreshes the capture from the selected taps.',
          },
        ],
      },
    ],
  }),

  filterCorr: infoDoc({
    name: 'Corr',
    lead: 'When on, correlation meters compare lanes in the Analyze band. When off, they compare the full-band delayed signals.',
    meta: [
      { label: 'DAW name', value: 'Filter Corr' },
      { label: 'Parameter ID', value: '69' },
      {
        label: 'Stored value',
        value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.',
      },
      { label: 'Default', value: '1 (on)' },
    ],
  }),

  masterWave: infoDoc({
    name: 'Master wave',
    lead: 'Two hit windows (L and R) that show the summed stem against the stereo Reference sidechain so you can line the bus up by eye.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            ul: [
              'Filled curve — Reference on that side (display only; never mixed into the output).',
              'Outline — the audible mix on that side, including Master Delay.',
              'Each curve is peak-normalized on its own so both reach full height.',
            ],
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Route a stereo bus into the Reference input in the host. Drag L or R horizontally (or turn Master Delay) to slide the mix outline against the Reference fill — both sides write the same Master Delay. A new Anchor hit refreshes the capture once the Wave window is full.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Reference is a stereo kAux input. If the host leaves it inactive or silent, only the mix outline draws. The mix pack already includes lane Delay, Phase, Gain, Pan, Mute, and Solo from the analysis sum.',
          },
        ],
      },
    ],
  }),

  masterTrim: infoDoc({
    name: 'Delay',
    lead: 'Shifts the whole stereo stem in time against the rest of the session and against the Reference in the Master waves.',
    meta: [
      { label: 'DAW name', value: 'Master Trim' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '−50 … +50 ms' },
      { label: 'Default', value: '0 ms' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            ul: [
              'Positive — delays the audio. That amount is not added to reported latency (the stem sits later vs the mix).',
              'Negative — does not delay inside the plugin. The absolute amount is reported as latency so the host can pull the stem earlier with PDC when the host applies it.',
            ],
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Watch the Master waves: the outline moves with this knob only — Reference fill stays put, and lane Delay does not shift the Master overlay. Use it after the lanes are roughly aligned if the whole bus still sits early or late against a room or overhead Reference. Bypass ignores this knob.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Reported latency is the pad needed for any negative lane Delay plus the absolute value of a negative Master Delay. Positive Master Delay only lengthens the internal master delay line. The Master wave pack shifts the mix by this value alone (no extra anchor offset).',
          },
        ],
      },
    ],
  }),

  masterVolume: infoDoc({
    name: 'Volume',
    lead: 'Overall level of the summed stereo output, after the lane Gains and pans.',
    meta: [
      { label: 'DAW name', value: 'Volume' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Applied to the stereo sum before the master delay line and the header Out gain. It still runs while Bypass is on.',
          },
        ],
      },
    ],
  }),

  anchor: infoDoc({
    name: 'Anchor',
    lead: 'Chooses the hit-trigger lane for captures. Both sides of a stereo Join pair show the sine mark (wave source); the clicked lane lights warn (hit), the partner lights accent.',
    meta: [
      { label: 'DAW name', value: 'Anchor' },
      { label: 'Parameter ID', value: '3' },
      {
        label: 'Stored range',
        value: '0…7 for lanes 1…8. The buttons write the lane index.',
      },
      { label: 'Default', value: '0 (lane 1)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Pick the lane with the clearest shared transient in the Analyze band. For a stereo OH or similar pair: Join the two lanes first, then click either side — that side becomes the hit trigger (warn), the partner stays accent. Correlation still uses the clicked lane after its Delay and Phase.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'Only the stored Anchor index arms the detector. Partner highlighting is UI only.',
              'Wave fills follow the stereo ghost rules (see Waveform): stereo Anchor → L↔L / R↔R on stereo lanes, L+R mid on mono; mono Anchor → that single lane everywhere.',
              'A new capture locks on the first half-period peak after a rise; louder half-periods only update the max. After a fall, the next rise locks again unless the ~½ Wave-span mute is still active. The ring then fills post into a fixed Wave axis and packs all lanes, the mix, and the Reference.',
            ],
          },
        ],
      },
    ],
  }),

  join: infoDoc({
    name: 'Join',
    lead: 'Links this lane to the group above so one top Delay moves the pair (or chain), while this lane keeps its own relative offset. A two-lane Join is also the stereo Anchor pair for wave ghosts.',
    meta: [
      { label: 'DAW name', value: 'B2 Join, and the same for B3…B8 (lane 1 has no Join)' },
      { label: 'Parameter ID', value: laneId(3) },
      {
        label: 'Stored value',
        value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.',
      },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Use it for a stereo pair or a tight group that should stay locked while you nudge the whole group from the top lane. Then trim Rel on the member if one side still leads or lags. With exactly two lanes Joined, clicking either Anchor button marks both: warn on the hit side, accent on the partner — and every strip’s fill uses L↔L / R↔R (mono lanes get L+R).',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'Effective delay for a joined member is group-root Delay plus that member’s Delay (Rel).',
              'Chains walk upward while Join is on; the first lane without Join above is the root.',
              'Stereo ghost pairing uses the first two lanes of the Anchor’s Join group. Longer chains still delay as one group; deeper members see the L+R mid fill.',
              'Mute, Solo, Phase, Gain, and Pan stay independent.',
              'Toggling Join converts the member’s Delay between absolute and relative so the audible time does not jump.',
            ],
          },
        ],
      },
    ],
  }),

  mute: infoDoc({
    name: 'Mute',
    lead: 'Removes this lane from the audible sum and from the Master-wave mix outline.',
    meta: [
      { label: 'DAW name', value: 'B1 Mute, and the same for B2…B8' },
      { label: 'Parameter ID', value: laneId(0) },
      {
        label: 'Stored value',
        value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.',
      },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The lane strip can still draw if the input is active. Correlation still runs when the bus is active. Mute does not clear the Anchor role.',
          },
        ],
      },
    ],
  }),

  solo: infoDoc({
    name: 'Solo',
    lead: 'Hears only the soloed lanes in the sum. If any Solo is on, unmuted non-solo lanes drop out of the mix.',
    meta: [
      { label: 'DAW name', value: 'B1 Solo, and the same for B2…B8' },
      { label: 'Parameter ID', value: laneId(1) },
      {
        label: 'Stored value',
        value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.',
      },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Wave ghosts and correlation still follow the Anchor and each lane’s analysis path. Solo only changes what is summed to the stereo output and into the Master mix outline.',
          },
        ],
      },
    ],
  }),

  phase: infoDoc({
    name: 'Phase',
    lead: 'Flips the polarity of this lane for alignment — same family as Delay, not part of the Gain/Pan mix.',
    meta: [
      { label: 'DAW name', value: 'B1 Phase, and the same for B2…B8' },
      { label: 'Parameter ID', value: laneId(2) },
      {
        label: 'Stored value',
        value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.',
      },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'If correlation sits near −1 while the waves look lined up, flip Phase. The outline in the strip flips with it on the next paint of the last capture. Bypass turns Phase off with Delay so you can A/B the alignment.',
          },
        ],
      },
    ],
  }),

  delay: infoDoc({
    name: 'Delay',
    lead: 'Time-shifts this lane (or, when Join is on, sets the relative offset to the group root).',
    meta: [
      { label: 'DAW name', value: 'B1 Delay, and the same for B2…B8' },
      { label: 'Parameter ID', value: laneId(4) },
      { label: 'Range', value: '−50 … +50 ms' },
      { label: 'Default', value: '0 ms' },
      {
        label: 'UI label',
        value: 'Dly Trm when alone; Rel when this lane’s Join is on.',
      },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            ul: [
              'Alone — the knob is absolute delay for that lane.',
              'Joined — the group root’s Delay is the base for everyone; Rel on a member is added to that base. Effective delay is clamped to −50…+50 ms.',
              'Negative values pull that lane earlier and raise the pad that is reported as plugin latency (so the host can compensate with PDC).',
            ],
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Watch the lane outline against the Anchor fill and the correlation meter. Small moves around a shared transient are enough; the wave outline updates as soon as the knob moves.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Every lane is padded by the most negative effective lane Delay so positive and relative shifts stay inside the delay lines. Display shifts are relative to the Anchor’s own effective delay.',
          },
        ],
      },
    ],
  }),

  pan: infoDoc({
    name: 'Pan',
    lead: 'Places this mono lane in the stereo sum.',
    meta: [
      { label: 'DAW name', value: 'B1 Pan, and the same for B2…B8' },
      { label: 'Parameter ID', value: laneId(6) },
      { label: 'Range', value: '−1 (L) … +1 (R). Centre is 0.' },
      { label: 'Default', value: '0 (C)' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Constant-power pan: left and right gains are cosine and sine of a quarter-turn from hard left to hard right. Pan also weights that lane in the Master-wave mix outline.',
          },
        ],
      },
    ],
  }),

  gain: infoDoc({
    name: 'Gain',
    lead: 'Level of this lane in the stereo sum.',
    meta: [
      { label: 'DAW name', value: 'B1 Gain, and the same for B2…B8' },
      { label: 'Parameter ID', value: laneId(5) },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Applied after Delay and Phase, before Pan. It also scales that lane in the analysis mix drawn in the Master waves. Lane waveform strips stay independently peak-normalized, so Gain does not change strip height.',
          },
        ],
      },
    ],
  }),

  corr: infoDoc({
    name: 'Correlation',
    lead: 'Live similarity of this lane to the Anchor in the Analyze band, after both lanes’ Delay and Phase.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            ul: [
              'Near +1 — aligned and same polarity in the Analyze band.',
              'Near 0 — little shared energy or still far apart in time.',
              'Toward −1 — aligned in time but inverted; try Phase.',
            ],
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Smoothed Pearson correlation of the two delay-aligned streams (Analyze band or full-band, per the Corr toggle). Inactive input buses fall toward 0. Not a VST parameter.',
          },
        ],
      },
    ],
  }),

  wave: infoDoc({
    name: 'Waveform',
    lead: 'Hit window around the last Anchor transient for this lane. Filled curve is the Anchor ghost; outline is this lane.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            ul: [
              'Fill — Anchor ghost, peak-normalized on its own. Mono Anchor: that lane. Stereo Join Anchor: matching side on a stereo lane (L↔L, R↔R); L+R mid on a mono lane.',
              'Outline — this lane after Delay and Phase, peak-normalized on its own.',
              'Horizontal shift is relative to this lane’s delay so lined-up hits sit on top of the ghost.',
            ],
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Drag the strip horizontally to write Delay (same range as the knob), or nudge the knob. Line the outline up with the fill; flip Phase if the shapes mirror. On a stereo pair, join first and pick either side as Anchor so left compares to left and right to right. Empty strips mean that input is inactive or below the silence floor for drawing.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'Not a scrolling DAW waveform. Width comes from Wave in the header (crop of the last lock). After a lock the outline grows as post arrives, then holds. Drag, Delay, Phase, and Wave re-pack when they change. The stereo ghost uses the first two lanes of the Anchor’s Join group; the hit detector listens only to the clicked Anchor index.',
          },
        ],
      },
    ],
  }),
};
