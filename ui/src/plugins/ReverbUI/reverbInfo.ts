/** Hover titles for Reverb controls (musicians / producers). */

export const reverbInfo = {
  active:
    'Turns the reverb wet path on or off. Off = silent wet (Dry level still applies) — instant mute of the space without killing your dry balance. On = early + late at the Wet level.',

  quality:
    'CPU vs density for the whole engine — pick by track count and how critical this space is.\n\n' +
    'Lo — lean path for many instances or weak CPUs: late tank uses 4 allpass stages (instead of 6), early reflections keep fewer image taps (Multi-Tap ≤12, Velvet ≤24 — Velvet stays available, just thinner), and Pre Diff is forced off (knob disabled). Expect a bit more “grain” / metallic edge on long decays and a sharper late onset.\n\n' +
    'Mid — default / balanced: full 6-stage late network, full Multi-Tap / Velvet tap budgets, Pre Diff with 4 allpass stages. Same character as the classic calfNXT room when you leave Quality alone.\n\n' +
    'Hi — densest late onset: same late tank and ER budgets as Mid, but Pre Diff runs 6 allpass stages so the bloom into the wash is smoother when Pre Diff is up. Use on featured vocals/leads when CPU allows; little difference if Pre Diff is near zero.',

  room:
    'Longest wall of the virtual room (meters). Bigger = longer early paths and a larger-feeling late network — more “hall,” less “box.” Small rooms can get metallic if late delays get too short; the engine lifts small sizes so the wash stays dense. 40 m ≈ a long hall side — not a radius. Listen for size vs. muddiness.',

  distance:
    'How far the listener sits from the source (near → far). Near = tighter, more intimate, earlier late wash. Far = more depth, extra late predelay (up to +40 ms), and a bit more Air — the source sits deeper in the room. Moves ER stereo/timing via the image-source model.',

  decay:
    'Late reverb RT60 — roughly how long the wash takes to fall by 60 dB. Longer = more sustain and romance; shorter = snappier rooms that get out of the way. Early reflections are independent; HF/LF damp can make the tail *sound* shorter than this number.',

  diffusion:
    'How smooth and blended the late reverb sounds. Higher = denser, more even cloud (less “echoey”). Lower = clearer with a hint of discrete repeats — more character, less polish. Controls how strongly the late network smears successive reflections.',

  preDiff:
    'Softens how the late reverb starts after predelay. Higher = gentler bloom into the wash (allpass smear on the late feed, up to ~50 ms) — less abrupt “hall on.” Lower = more immediate late onset. Early reflections stay sharp. Chart shows the late attack slope (limited by predelay length). Inactive on Quality Lo (forced off / knob disabled); Hi uses a denser 6-stage smear than Mid’s 4.',

  predelay:
    'Silence before the late wash arrives (early reflections stay immediate). More predelay keeps vocals/drums clear in front of the hall; less = more glued, “in the room.” Distance adds up to +40 ms on top — the chart shows that effective late start.',

  erMode:
    'Flavor of the first wall-bounce reflections (image-source taps). Off = none (only late wash). Multi-Tap = clearer early hits and room geometry. Velvet = denser early cloud — softer, less discrete slap. Early energy is what makes a space feel real before the tail blooms. Quality Lo does not disable Velvet — it only caps tap count (Multi ≤12 / Velvet ≤24) so the cloud stays thinner and cheaper; Mid/Hi use the full budgets.',

  path:
    'How early and late are wired. Parallel = both side by side (classic mix of slap + wash). Serial = early feeds into late for a rounder join — often smoother, less “two layers.” ER/Late levels still set how much of each you hear.',

  erLevel:
    'Loudness of the early reflections. Up = more room presence, slap, and localization; down = mostly the late wash. Too much ER can clutter a busy mix; too little can make the reverb feel like a generic tail with no room.',

  lateLevel:
    'Loudness of the dense late reverb (bloom/tail). Up = more wash and sustain; down = more early/direct character. Balance with ER so you get a room, not only a fog.',

  hfDamp:
    'How quickly the tail loses brightness. Lower cutoff / more damp = darker, more “real room” decay of highs — less hissy wash. Brighter tails feel airy but can harden vocals and cymbals. Implemented as a low-pass in the late recirculating path.',

  lfDamp:
    'How much bass is thinned out of the ringing tail. Higher = cleaner sustain, less muddy wash under kick/bass. Lower = fuller, heavier reverb that can bloom in the low end. Bass roll-off inside the late path.',

  air:
    'Adds sheen and “open” top to the wet sound. Higher = brighter, airier reverb on the wet output (Distance lifts it a little too). Not the late attack — use PreDiff for soft onset. Too much Air can make the wet harsh or thin.',

  modRate:
    'How fast the late reverb “breathes” or moves. Slow = gentle drift (natural). Fast = more swirl, almost chorus-like. Speed of the modulator that varies late delay times — kills metallic resonances when Depth is up.',

  modDepth:
    'How much that movement is audible. Higher = livelier, less metallic; too high can sound wobbly or pitchy. Depth of late delay-time modulation — pair with a moderate Rate.',

  widthMode:
    'How the wet stereo image is widened (dry stays as-is). Dry = no widening. M/S = boost side vs mid. Haas = tiny L/R time offset (wide but mono-careful). Decor = allpass decorrelation on the side (mid stays clearer). Pick by whether you want clean width, Haas bloom, or decorrelation smear.',

  width:
    'How wide the wet image is (1 ≈ natural). Higher = wider hall; lower = more mono-safe. Exact feel depends on Width Mode. Ignored when Width Mode is Dry. Check mono — extreme width can disappear or hollow out.',

  duck:
    'Turns the reverb down when the dry signal is loud. Higher = more “sing/play in front, hall behind” — great on vocals and leads. Sidechain-style GR of the wet from the dry level. Too much and the space pumps unnaturally.',

  gate:
    'Classic gated reverb on/off. On = the wet opens with dry hits, then shuts — punchy drums / 80s vibes. Off = normal decaying wash. Dry-triggered gate on the wet path.',

  gateThresh:
    'How loud the dry must be to open the gate. Closer to 0 dB = only strong hits open the hall; lower = more of the performance opens the gate. Set so ghost notes don’t keep the gate flapping.',

  gateHold:
    'How long the gate stays open after a hit. Longer = more of the tail gets through before it closes — bigger gated burst. Shorter = tighter chop.',

  gateRelease:
    'How fast the gate closes. Short = abrupt 80s chop; long = softer fade of the wet. Match to the groove so the cut feels intentional, not random.',

  freeze:
    'Holds the late reverb in place. On = the current wash keeps ringing (almost endlessly) and new audio stops feeding the late path; early reflections and dry still run. Pads, drones, or catching a moment of space — turn off to let the held wash decay naturally again.',

  dry:
    'Level of the unprocessed signal. This path skips predelay, filters, and reverb — only In/Out gains apply before it. Keep high for clarity; lower to push the source deeper into the room.',

  wet:
    'Overall level of the reverb (early + late after width/dynamics). Higher = more space; lower = drier mix. Independent of Dry — set loudness with Wet, depth with Room/Distance/Decay.',
} as const;
