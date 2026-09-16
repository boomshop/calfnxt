export const expanderInfo = {
  bypass:
    'Turns expansion/gating off so you hear the dry path (In/Out gains still apply). A/B whether the expander is cleaning space or eating body.',
  sidechainActive:
    'Uses the external Sidechain input for the envelope detector (Mode, Link, HP/LP filters) instead of the main program bus. Route a reference track into the host’s sidechain port and enable this — expansion/gating follows that source while audio still passes through the main input. With no sidechain routed, detection falls back to the main signal.',
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
  panelDetector:
    'Main open detector: filters, Peak/RMS/Opto, stereo link, and the external Sidechain key switch. This is what tries to open the gate.',
  panelInv1:
    'Inverse sidechain 1 — forces the gate closed only when this key is louder than the main detector (relative). Snare bleed on a quiet tom → closed; real tom (or tom+snare together) → stays open. LED = armed; tab turns warn while actually holding shut.',
  panelInv2:
    'Inverse sidechain 2 — second relative inhibit key (e.g. kick). Same law as Inv 1: closes only when this bus outranks the main detector.',
  invActive:
    'Arms this inverse sidechain. When on, the Inhibit input can force the expander toward Range — but only when that key is stronger than the main detector. Host must route audio to Inhibit 1 / Inhibit 2. Tab turns warn while this path is holding the gate shut; the dashed history trace shows the same over time.',
  invGain:
    'Makeup/cut on the inhibit key before its filters and the relative compare. Raise to make this key win more easily against the main; lower if it closes on real hits.',
  invThreshold:
    'Absolute floor on the inhibit key before it can compete. Below this, Inv is ignored (noise floor). Above it, closing still needs the key to be louder than the main detector — equal/louder main keeps the gate open (simultaneous tom+snare).',
  invHold:
    'Keeps a winning inhibit closed for this long after the relative desire falls. Useful so a kick or snare body keeps a quiet tom gate shut for the whole hit.',
  invRelease:
    'How fast the force-closed amount fades after Hold. Short = gate can reopen quickly; longer = smoother hand-off back to the main detector.',
  invListen:
    'Solos this inhibit path (post filter / gain) so you can tune HP/LP and threshold by ear. Exclusive with the main Sidechain Listen and the other Inv Listen.',
};
