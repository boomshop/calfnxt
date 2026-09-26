export const crusherInfo = {
  bypass: 'Bypass the crusher. In/Out gains stay unity while bypassed.',

  channel:
    'Which stereo path gets bit-crushed. Stereo = both channels. Left / Right = crush one side only (the other stays dry). Mid = crush the centre while leaving width alone — lo-fi vocals/kick without thinning the sides. Side = crush width and ambience. Mix still blends crush vs dry inside the selected path. Mid/Side is encode → crush → decode.',

  bits:
    'Bit depth of the quantizer (continuous 1…16). Lower = heavier crushing. Ticks at classic bit depths.',
  morph: 'Dry/wet mix of the bit crusher (0 = dry, 100% = full crush).',
  mode:
    'Logarithmic quantization. Softer gating on quiet signals than Linear mode.',
  dc:
    'Asymmetric DC before quantization (−12…+12 dB). Positive and negative half-waves crush differently.',
  aa:
    'Soft step transitions between quantization levels (not a lowpass). 0 = hard steps, 1 = maximum softness.',
};
