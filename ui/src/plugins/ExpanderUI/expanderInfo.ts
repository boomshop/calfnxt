export const expanderInfo = {
  bypass:
    'Turns expansion/gating off so you hear the dry path (In/Out gains still apply). A/B whether the expander is cleaning space or eating body.',
  channel:
    'Which stereo path the detector and expansion/gating act on (same path). Stereo = both channels; Link still decides how L/R share the detector. Left / Right = hear and expand one side only. Mid = detect and clean the centre while leaving width. Side = detect and gate ambience/width without chewing the mono sum. External sidechain is also read through Channel. Inhibit keys stay on their own buses. Mid/Side is encode → detect/expand → decode.',
  sidechainActive:
    'Uses the external Sidechain input for the envelope detector (Mode, Link, HP/LP filters) instead of the main program bus. Route a reference track into the host’s sidechain port and enable this — expansion/gating follows that source while audio still passes through the main input. This key tries to open the gate. Inhibit 1 / Inhibit 2 (Inv tabs) are separate buses for signals that should force it closed. With no sidechain routed, detection falls back to the main signal.',
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
    'Main detector — this is what tries to open the expander/gate. Filters, Peak/RMS/Opto, stereo link, and the external Sidechain key all live here. Inv 1 / Inv 2 are the opposite job: extra buses that can force the gate closed when bleed or a competing hit would otherwise sneak through.',

  panelInv1:
    'Inverse sidechain 1 — route a signal here that should force this gate shut (classic: snare into a tom gate, kick into a bass gate). Unlike the Detector tab, Inv never opens the gate; it only pulls toward Range, and only while this key is louder than the main detector. Quiet tom + loud snare bleed → closed. Real tom, or tom+snare together → stays open. Host bus is Inhibit 1. LED = armed; the tab turns warn and the dashed history trace lights while this path is actually holding shut.',

  panelInv2:
    'Inverse sidechain 2 — a second inhibit bus with the same law as Inv 1. Route another “please close me” key here (often kick while Inv 1 is snare). Closes only when this key outranks the main detector; simultaneous real hits still win. Host bus is Inhibit 2. LED = armed; warn colour + dashed history while it is holding the gate shut.',

  invActive:
    'Arms this inverse sidechain. Off = Inhibit audio is ignored (you can still Listen to tune filters). On = when the key beats the main detector it forces the expander toward Range, as if the gate had closed. In the host, send the competing track to Inhibit 1 or Inhibit 2 — without a route, arming does nothing. The tab LED shows armed; the tab (and dashed history) go warn only while this path is actually holding shut. A/B by flipping this: if real hits now get eaten, Gain is too high or Thresh too low.',

  invGain:
    'Trim on the inhibit key before HP/LP and the relative compare. Raise to make this bus win more easily against the main detector (more aggressive bleed kill). Lower if the gate now slams shut on real tom/kick hits that should stay open. Think of it as “how seriously we take this key,” not makeup on the audio path — the main output is unchanged except for the extra close. ± a few dB is usually enough; huge boosts make Inv dominate even when the drum is playing.',

  invThreshold:
    'Absolute floor on the inhibit key before it is allowed to compete. Below this, Inv is ignored — use it to sit above bleed/noise so the key only wakes on real hits of that bus. Once above the floor, closing still requires this key to be louder than the main detector (about 6 dB of dominance to fully force Range). Equal or louder main keeps the gate open, so a real tom with snare on top will not get choked. If Inv never fires, lower Thresh or raise Gain; if it fires on hiss, raise Thresh and/or HP the key.',

  invHold:
    'How long a winning inhibit stays fully closed after the key stops beating the main detector. Covers the body of a snare or kick so a quiet tom gate does not flicker open between the transient and the ring. Too short = chatter / bleed pokes through the tail. Too long = the next real hit on this track stays gated after the competing drum has gone. 0 = start fading as soon as the key loses.',

  invRelease:
    'How fast the force-closed amount fades after Hold. Short = the main detector can reopen quickly once the competing hit is gone — snappy, can click if Range is deep. Longer = smoother hand-off, the gate eases back instead of jumping open. Match it to the competing drum’s tail; this is not the expander’s own Release knob.',

  invListen:
    'Solos this inhibit path (after Gain and HP/LP) so you hear what the close-key actually is — not the gated track. Tune filters and Thresh until Listen is mostly the competing drum, then turn Listen off. Exclusive: Inv 1 Listen beats Inv 2, which beats the main Sidechain Listen. Does not arm Inv by itself.',
};
