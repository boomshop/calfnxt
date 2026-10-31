/** Shared hover titles for FrequencyRange controls (musicians / producers). */

import { infoDoc } from '../WithInfo/infoDoc';

/** Plugin-specific copy. Missing keys fall back to {@link frequencyRangeInfo}. */
export type FrequencyRangeInfo = {
  listen?: string;
  hpMode?: string;
  hipass?: string;
  lopass?: string;
  lpMode?: string;
  chart?: string;
};

export const frequencyRangeInfo = {
  listen: infoDoc({
    name: 'Listen',
    lead: 'Lets you hear the filtered band on its own.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          { p: 'Tune the corners, then turn it off. It does not change the stored cutoffs by itself. The plugin that owns this filter says what the solo replaces.' },
        ],
      },
    ],
  }),

  hpMode: infoDoc({
    name: 'Highpass slope',
    lead: 'Sets how steeply the lows are taken out of this path.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [{ p: 'Off leaves the lows in. A steeper slope cuts harder and shifts the phase more. The plugin says whether this path is later mixed with dry.' }],
      },
    ],
  }),

  hipass: infoDoc({
    name: 'Highpass',
    lead: 'Sets the low corner of this path, in hertz.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [{ p: 'Higher takes more low end out. The slope has to be above Off or this corner is not in the path.' }],
      },
    ],
  }),

  lopass: infoDoc({
    name: 'Lowpass',
    lead: 'Sets the high corner of this path, in hertz.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [{ p: 'Lower takes more top out. The slope has to be above Off or this corner is not in the path.' }],
      },
    ],
  }),

  lpMode: infoDoc({
    name: 'Lowpass slope',
    lead: 'Sets how steeply the highs are taken out of this path.',
    sections: [
      {
        heading: 'How to use it',
        blocks: [{ p: 'Off leaves the highs in. A steeper slope cuts harder. The plugin says whether this path is later mixed with dry.' }],
      },
    ],
  }),
} as const;
