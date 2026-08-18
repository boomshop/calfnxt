export const flangerInfo = {
  active:
    'Turns the wet (flanged) path off so you hear Dry only — same idea as Delay/Reverb Power. In/Out gains still apply; LFO and the response chart keep moving.',
  minDelay:
    'Shortest delay of the comb (ms). Lower = denser, brighter notches; higher = thicker, more “jet” spacing. Classic flanging sits around a few tenths of a millisecond.',
  modDepth:
    'How far the LFO stretches the delay above Min Delay (ms). Small depth = subtle swirl; larger = dramatic whoosh. Depth + Min set the comb spacing you hear in the chart.',
  modRate:
    'LFO speed in Hz. Slow (~0.05–0.2) = classic through-zero whoosh; faster = vibrato-like flutter. Pair with Depth so the sweep still covers musically useful bands.',
  feedback:
    'Feeds the delayed signal back into the delay. Positive = sharper metallic peaks; negative = complementary notches. Near ±1 can ring hard — musical as an effect, careful on a full mix.',
  stereo:
    'LFO phase offset between Left and Right in degrees. 0 = mono image; 90 = classic wide Calf default; 180 = opposite sweep. Sweep the knob to animate the stereo field.',
  amount:
    'Wet (flanged) level in dB. Raise for stronger color; lower to sit under Dry. Above 0 dB can push peaks hot with Feedback.',
  dry:
    'Dry (unflanged) level in dB. Keep near 0 for parallel flanging; pull down for a more washed / wet-only sound.',
  lfo:
    'Runs or freezes the modulation LFO. Off holds the current comb positions — useful to tune Delay/Depth/Feedback, or for a static flange color. On resumes the sweep from where it stopped.',
  reset:
    'Resets LFO phases (Left = 0°, Right = Stereo offset). Use after tempo changes or when L and R feel stuck out of sync.',
};
