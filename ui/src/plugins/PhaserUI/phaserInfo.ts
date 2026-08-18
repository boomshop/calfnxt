export const phaserInfo = {
  active:
    'Turns the wet (phased) path off so you hear Dry only — same idea as Delay/Reverb Power. In/Out gains still apply; LFO and the response chart keep moving.',
  baseFreq:
    'Center frequency the allpass cascade sweeps around (Hz). Lower = darker, slower-sounding notches; higher = brighter, more “air” phasing. Classic sweet spot is often midrange.',
  modDepth:
    'How far the LFO swings the allpass frequency around Center, in cents (100 ct = 1 semitone). 0 = fixed notch; large values = deep, dramatic sweeps. Extreme depth can push notches into sub or ultrasonic range and thin the sound.',
  modRate:
    'LFO speed in Hz. Slow (~0.05–0.2) = classic swirl; faster = vibrato-like flutter. Pair with Depth so the sweep still covers musically useful bands.',
  feedback:
    'Feeds the allpass output back into the cascade. Positive = sharper peaks / more resonant “jet”; negative = complementary notches. Near ±1 can ring or self-oscillate — musical as an effect, careful on a full mix.',
  stages:
    'Number of first-order allpass stages (1–12). More stages = more notches / denser comb. 4–6 is classic; 8–12 gets thicker and darker.',
  stereo:
    'LFO phase offset between Left and Right in degrees. 0 = mono image; 180 = classic wide opposite sweep. Sweep the knob to animate the stereo field.',
  amount:
    'Wet (phased) level in dB. Raise for stronger color; lower to sit under Dry. Above 0 dB can push peaks hot with Feedback.',
  dry:
    'Dry (unphased) level in dB. Keep near 0 for parallel phasing; pull down for a more washed / wet-only sound.',
  lfo:
    'Runs or freezes the modulation LFO. Off holds the current notch positions — useful to tune Center/Depth/Feedback, or for a static allpass color. On resumes the sweep from where it stopped.',
  reset:
    'Resets LFO phases (Left = 0°, Right = Stereo offset). Use after tempo changes or when L and R feel stuck out of sync.',
};
