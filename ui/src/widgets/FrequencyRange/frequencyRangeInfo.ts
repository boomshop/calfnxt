/** Shared hover titles for FrequencyRange controls (musicians / producers). */

export const frequencyRangeInfo = {
  listen:
    'Solos the filtered path so you can hear what the HP/LP band is focusing on (sidechain detector, feedback, envelope filter, etc.). Tune until the solo is mostly the problem or the energy you want — then turn Listen off. Does not permanently change the main mix by itself.',

  hpMode:
    'High-pass slope into the filter. Off = no HP (full lows into the path). 12–48 dB = steeper cut of bass — how hard rumble/weight is removed before detection, feedback, or shaping. Steeper = cleaner focus, more phase shift.',

  hipass:
    'High-pass cutoff (Hz). Higher = less low end in the filtered path — ignore kick bloom, rumble, or muddy feedback so the detector/effect reacts to mids/highs. Too high and you miss the real energy; too low and lows keep triggering or looping.',

  lopass:
    'Low-pass cutoff (Hz). Lower = less highs in the filtered path — ignore cymbals, air, or bright repeating trails. Useful so a compressor/de-esser/transient detector isn’t distracted by hiss. Too low can make the path dull and insensitive.',

  lpMode:
    'Low-pass slope into the filter. Off = no LP (full highs). 12–48 dB = steeper cut of highs. Steeper = tighter focus on the midband; gentler = smoother, less surgical.',
} as const;
