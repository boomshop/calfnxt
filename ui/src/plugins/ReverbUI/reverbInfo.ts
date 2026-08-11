/** Hover titles for Reverb controls (musicians / producers). */

export const reverbInfo = {
  active:
    'Turns the reverb wet path on or off. Off = silent wet (Dry level still applies); On = early + late at the Wet level.',
  room:
    'Longest wall length of the virtual room (meters). Scales early-reflection paths from a shoebox image-source model. Late delays follow room size too, but small rooms are lifted so the wash stays dense instead of metallic. 40 m ≈ a long hall side — not a radius or diameter.',
  distance:
    'How far the listener sits from the source along the room length (near → far). Moves image-source ear positions (ER timing/stereo), adds late predelay (up to +40 ms), and nudges Air.',
  decay:
    'Late reverb RT60 — approximate time for the wash to fall by 60 dB. Longer = more sustain; shorter = snappier rooms. Early reflections are independent; room size still sets the delay network length. HF/LF damp can make the tail sound shorter than this.',
  diffusion:
    'How smooth and blended the late reverb sounds. Higher = denser, more even cloud; lower = clearer with a hint of discrete echoes. Controls how strongly the late network smears successive reflections.',
  preDiff:
    'Softens how the late reverb starts after predelay. Higher = gentler bloom into the wash (allpass smear on the late feed, up to ~50 ms). Shown on the chart as the late attack slope (display limited by predelay length). Early reflections stay sharp.',
  predelay:
    'Silence before the late wash arrives (early reflections stay immediate). More predelay keeps vocals/drums clear in front of the hall. Distance adds up to +40 ms on top — the chart shows that effective late start.',

  erMode:
    'Flavor of the first wall-bounce reflections (shared mid → L/R image taps, orders 1–3). Off = none; Multi-Tap = all 1st/2nd-order hits plus strongest 3rd-order; Velvet = denser order-1…3 cloud (CPU-capped).',
  path:
    'How early reflections and late reverb are wired. Parallel = both run side by side; Serial = early reflections feed into the late reverb for a rounder join. Levels (ER / Late) still set how much of each you hear.',
  erLevel:
    'Loudness of the early reflections. Up = more room presence and slap; down = mostly the late wash. Gain on the early path in the wet mix.',
  lateLevel:
    'Loudness of the dense late reverb (the bloom/tail). Up = more wash; down = more early/direct character. Gain on the late path in the wet mix.',

  hfDamp:
    'How quickly the tail loses brightness. Lower = darker, more “real room” decay of highs. A low-pass filter inside the late reverb’s recirculating path.',
  lfDamp:
    'How much bass is thinned out of the ringing tail. Higher = cleaner sustain, less muddy wash. Bass roll-off inside the late reverb’s recirculating path.',
  air:
    'Adds sheen and “open” top to the wet sound. Higher = brighter, airier reverb. A gentle high shelf on the wet output (Distance lifts it a little too) — not the late attack; use PreDiff for soft onset.',

  modRate:
    'How fast the late reverb “breathes” or moves. Slow = gentle drift; fast = more swirl, almost chorus-like. Speed of the modulator that gently varies late delay times.',
  modDepth:
    'How much that movement is audible. Higher = livelier, less metallic; too high can sound wobbly/pitchy. Depth of late delay-time modulation.',

  widthMode:
    'How the wet stereo image is widened (dry stays as-is). Dry = no widening; M/S = boost side vs mid; Haas = tiny L/R time offset; Decor = allpass decorrelation on the side (mid stays clear). Three wideners after the reverb, or Dry to bypass them.',
  width:
    'How wide the wet image is (1 ≈ natural). Higher = wider; lower = more mono-safe. Exact feel depends on Width Mode (side amount, Haas timing, or decorrelation). Ignored when Width Mode is Dry.',

  duck:
    'Turns the reverb down when the dry signal is loud. Higher = more “sing/play in front, hall behind”. Sidechain-style gain reduction of the wet from the dry level.',
  gate:
    'Classic gated reverb on/off. On = the wet opens with dry hits, then shuts — punchy drums/80s vibes. A dry-triggered gate on the wet path.',
  gateThresh:
    'How loud the dry must be to open the gate. Closer to 0 dB = only strong hits open the hall. Gate open threshold.',
  gateHold:
    'How long the gate stays open after a hit. Longer = more tail gets through before it closes.',
  gateRelease:
    'How fast the gate closes. Short = abrupt chop; long = softer fade of the wet. Gate close time.',

  freeze:
    'Holds the late reverb in place. On = the current wash keeps ringing (almost endlessly) and new audio stops feeding the late path; early reflections and dry still run. Great for pads, drones, or catching a moment of space.',
  dry:
    'Level of the unprocessed signal. This path skips predelay, filters, and reverb — only In/Out gains apply before it. Balance against Wet for how much direct sound you keep.',
  wet:
    'Overall level of the reverb (early + late after width/dynamics). Higher = more space; lower = drier mix. Independent of Dry.',
} as const;
