/** Shared hover titles for FrequencyRange controls (musicians / producers). */

export const frequencyRangeInfo = {
  listen:
    'Solos the filtered path so you can hear what the HP/LP band is focusing on (detector, feedback, or reverb input). Does not change the main mix by itself.',
  hpMode:
    'High-pass slope into the filter. Off = no HP; 12–48 dB = steeper cut of lows (how hard bass is removed before detection / feedback).',
  hipass:
    'High-pass cutoff (Hz). Higher = less low end in the filtered path — useful to ignore rumble, kick bloom, or muddy feedback.',
  lopass:
    'Low-pass cutoff (Hz). Lower = less highs in the filtered path — useful to ignore cymbals, air, or bright repeating trails.',
  lpMode:
    'Low-pass slope into the filter. Off = no LP; 12–48 dB = steeper cut of highs.',
} as const;
