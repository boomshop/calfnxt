/** Hover titles for the shared header In and Out gains. */

import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const headerInfo = {
  inGain: infoDoc({
    name: 'In',
    lead: 'Sets the level before the effect. The In meter is this level.',
    meta: [
      { label: 'DAW name', value: 'In' },
      { label: 'Parameter ID', value: '0' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'When this plugin has a Bypass and it is on, this gain is forced to unity. Plugins that have no Bypass always use it. The meter keeps running either way.',
          },
        ],
      },
    ],
  }),

  outGain: infoDoc({
    name: 'Out',
    lead: 'Sets the level after the effect. The Out meter is this level.',
    meta: [
      { label: 'DAW name', value: 'Out' },
      { label: 'Parameter ID', value: '1' },
      { label: 'Range', value: '−60 … +12 dB' },
      { label: 'Default', value: '0 dB' },
    ],
    sections: [
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'When this plugin has a Bypass and it is on, this gain is forced to unity. Plugins that have no Bypass always use it. The meter is after the gain.',
          },
        ],
      },
    ],
  }),
} as const;
