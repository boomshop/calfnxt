export const expanderInfo = {
  bypass:
    'Turns expansion/gating off so you hear the dry path (In/Out gains still apply). A/B whether the expander is cleaning space or eating body.',
  mode: 'How the detector measures level. Peak = snappy, follows hits. RMS = smoother average — less chatter. Opto = photocell-like ballistics that soften attack/release as reduction deepens.',
  link: 'How L/R feed the detector. Max = louder channel wins. Avg = mean of both. Mid = Mid/sum only — useful when you want expansion driven by the phantom center.',
  threshold:
    'Open threshold. Above this the expander stays open (unity). Below it, ratio expansion pulls the signal down toward Range. Raise to gate more; lower to leave more body.',
  releaseThreshold:
    'Close threshold (hysteresis). The expander only re-closes once the detector falls below this level. Set it below Threshold to reduce chatter on borderline signals; equal = no hysteresis.',
  ratio:
    'How steeply level drops below the open threshold. 1:1 = off. Higher = stronger gate/expander. Extreme ratios with deep Range approach classic gating.',
  knee: 'Softens the open threshold and the landing into Range. 0 = hard corners. Higher = gentler engagement and less abrupt floor.',
  attack:
    'How fast the detector envelope rises. Short = reacts to hits quickly (opens/tracks faster). Longer = ignores brief spikes.',
  hold: 'Keeps the expander open for this long after the detector falls below Rel Thresh, before closing begins. Stops chatter on gaps without slowing the release itself. 0 = close immediately.',
  release:
    'How fast the detector envelope falls. Short = snaps closed; long = hangs open / recovers slowly after material drops.',
  range:
    'Maximum gain reduction (floor). 0 dB = no floor (expansion can go silent in theory). More negative = harder gate when fully closed. Soft-knee also eases into this floor.',
  gr: 'How many dB the expander is currently turning the signal down. Spikes on quiet gaps are normal; a meter stuck deep means you’re continuously gating the body.',
  relThreshActive:
    'Whether to use the release threshold as the close threshold. If disabled, the threshold is used as the close threshold.',
};
