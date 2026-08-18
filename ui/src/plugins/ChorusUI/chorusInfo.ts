export const chorusInfo = {
  active:
    'Turns the wet (chorused) path off so you hear Dry only — same idea as Delay/Reverb Power. In/Out gains still apply; LFO charts keep moving.',
  minDelay:
    'Shortest delay of the multi-tap chorus (ms). Higher values thicken and slow the swirl; lower values sound brighter and tighter.',
  modDepth:
    'How far each voice sweeps above Min Delay (ms). Small depth = subtle width; larger = lush detuning. Voices share this depth across the overlap bands.',
  modRate:
    'LFO speed in Hz. Slow (~0.05–0.2) = classic ensemble swirl; faster = vibrato-like motion. The Rate panel shows one period of each voice sine.',
  stereo:
    'LFO phase offset between Left and Right in degrees. 0 = mono image; 180 = classic opposite-phase Calf default. Sweep to animate the stereo field.',
  voices:
    'Number of delay taps (1–8). More voices = denser chorus; each tap gets its own LFO band (see Depth / Rate charts).',
  vphase:
    'Phase step between successive voices in degrees. Spreads taps around the LFO cycle so they do not move in lockstep.',
  overlap:
    'How much voice LFO bands share the delay span. 100% = all voices in the same band; lower = voices spread across Min→Min+Depth (Depth panel).',
  amount:
    'Wet (chorused, post-filtered) level in dB. Raise for stronger color; lower to sit under Dry.',
  dry:
    'Dry (unprocessed) level in dB. Keep near 0 for parallel chorus; pull down for a wetter blend.',
  lfo:
    'Runs or freezes the modulation LFO. Off holds current tap positions — useful to tune Delay/Depth/Voices. On resumes from where it stopped.',
  reset:
    'Resets LFO phases (Left = 0°, Right = Stereo offset). Use when L and R feel stuck out of sync.',
  post:
    'Post-filter on the wet path only (Linkwitz-Riley HP/LP). Shapes the chorus color without nulling Dry — cancellation-free complementary slopes. Use Listen to hear the filtered wet alone.',
  listen:
    'Solos the post-filtered chorus wet (× Amount), without Dry. Tune HP/LP until the solo is the color you want — then turn Listen off.',
  chart:
    'Live LFO positions for every delay tap — not a frequency response. Accent dots = Left, warn = Right. Top panel (Depth): each voice is an L/R pair along the Min Delay → Min+Depth span; horizontal place = where that tap sits in the sweep right now. High Overlap packs voices into one band; lower Overlap spreads them across the span. Bottom panel (Rate): one sine per voice over a full LFO period (X = phase); live dots ride those curves so Y is the current modulation. VPhase shifts voices apart on the cycle; Stereo offsets the whole Right set vs Left. Freeze LFO to park the dots; Reset re-anchors Left at 0° and Right at the Stereo offset.',
};
