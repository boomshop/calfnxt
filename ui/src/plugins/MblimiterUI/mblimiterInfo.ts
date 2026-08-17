/** Hover titles for Multiband Limiter controls (musicians / producers). */

export const mblimiterInfo = {
  bypass:
    'Turns all limiting off so you hear the dry path (In/Out gains still apply). A/B the whole multiband treatment — loudness vs. squashed dynamics.',

  mono:
    'Process the Left channel only (one crossover path) and copy to both outs. Big CPU win with many bands / steep slopes — ideal on mono tracks. Right is ignored while on.',

  diffListen:
    'Lets you hear only what the limiter removes (dry minus limited). Loud, clicky, or tonal junk here means you’re taking a lot away — often too much. Clean, brief “tick” on hits means tasteful peak control.',

  numBands:
    'How many frequency bands you split into. Fewer = broader, simpler control (less crossover coloration). More = surgical (kick vs. vocal vs. cymbals), but more phase rotation and more to manage. Adding a band splits the top band at a new crossover.',

  slope:
    'Steepness of the Linkwitz-Riley crossovers. Steeper = tighter band separation (less bleed between bands) but more phase rotation — can sound more “processed.” Gentler slopes = smoother joins, bands influence each other more.',

  xover:
    'Crossover frequency between bands. Drag the vertical handles in the chart. Place splits where instruments live so each strip limiter works on a clear job.',

  bandListen:
    'Solos this band’s output so you hear only what that band is working on. Only one band at a time. Great for setting Weight / Release on kick vs. vocal without the full mix masking it.',

  bandWeight:
    'How hard this band contributes to limiting relative to the others (−1…+1). Positive = this band gets more of the ceiling work; negative = it stays freer while siblings take more GR. Use Listen to hear the balance.',

  bandRelease:
    'Per-band release offset (−1…+1) around the master Release. Positive = slower recovery in this band; negative = faster. Lets lows settle calmly while highs recover quicker (or the reverse).',

  bandIn:
    'Level of this band after the crossover split (pre-limit). Shows how loud that slice of the spectrum is going into the strip limiter.',

  bandOut:
    'Level of this band after limiting. Compare to Band In to see how hard the strip is being worked.',

  bandGr:
    'How many dB this band’s strip limiter is currently pulling down. Deep constant GR means that range is being continuously squashed.',

  history:
    'Scrolling history (about 10 seconds): full-range level, this band’s level, and its gain reduction. Use it to see whether GR tracks hits cleanly or rides the whole phrase.',

  limit:
    'The loudness ceiling. Lower = more of the signal hits the wall and gets turned down — the mix gets denser and “louder” sounding, but peaks lose headroom. With Auto Level on, turning Limit down also boosts the overall level so the ceiling still sits at full scale.',

  attack:
    'How far ahead the limiter looks before a peak arrives. Longer = it can pull gain down earlier, so hard hits feel smoother and less “clipped”; shorter = more punch left on the attack, but more risk of a brief overshoot or harder grab. Longer look also means more latency in the DAW.',

  release:
    'How fast level comes back up after a peak (master). Fast = punchy and lively, but can pump. Slow = calmer and more glued, but the whole mix can stay quieter for longer after loud hits. Per-band Release offsets this.',

  minRelease:
    'Keeps each strip’s effective release from going shorter than about 2.5 cycles of that band’s lowest frequency. Stops very fast release on low bands from churning and distorting; highs stay freer. Turn on when lows pump or sound grainy with short Release.',

  asc:
    'Adaptive release that listens to recent peaks instead of always recovering the same way. On dense material it often sounds more natural and less “bouncey” than a fixed release — especially on full mixes and drums.',

  ascCoeff:
    'How strongly ASC reshapes the release. Higher = recovery aims more toward the average loudness of recent peaks (often smoother on busy tracks). Lower = closer to a classic fixed release.',

  oversampling:
    'Runs the limiter at a higher internal sample rate so sharp peaks between samples are caught better. Higher settings can sound a bit cleaner/safer on bright transients; 1× is lighter on CPU.',

  autoLevel:
    'When on, lowering the Limit automatically makes up the loudness so the output still peaks near 0 dB. That makes Limit feel like a “how hard do I smash” control. When off, Limit is a real quieter ceiling.',

  curve:
    'The shape of the gain ride into and out of peaks. Linear = even, straightforward. Log = more “leveling” feel in dB. Cos = soft ease-in/out — usually the gentlest grab.',

  knee:
    'Softens the brickwall. 0 dB = hard stop — maximum loudness and a very clear “hit the ceiling” feel. Higher knee = reduction starts earlier and eases in, so limiting is less obvious and more glued.',

  colorEnable:
    'Turns on pre-limit saturation. Off = clean path into the brickwall; on = Color Amount shapes density/warmth. The Amount knob keeps its value while disabled so you can A/B without losing the setting.',

  color:
    'How much soft saturation before the limiter. Low = subtle glue; high = obvious drive. Only active when Color is switched on.',

  truePeak:
    'Turns on true-peak limiting (at least 2× oversampling + Margin). Off = classic sample-peak brickwall (louder possible). On = safer for streaming/bounces where inter-sample peaks would otherwise clip.',

  margin:
    'Extra safety under the Limit while True Peak is on. Small (≈0.1 dB) stays loud; larger is cleaner after export but leaves more unused headroom. Only applies when True Peak is enabled.',

  holdEnable:
    'Turns on Release Hold. Off = release starts immediately after a peak; on = Time sets how long gain stays down first. Keeps the Time setting while disabled for easy A/B.',

  releaseHold:
    'How long gain reduction stays down after a peak before release. Helps vocals not pump after consonants. Too much can duck the mix after every hit. Only active when Hold is on.',

  emphasisEnable:
    'Turns on program-dependent release. Off = fixed Release time; on = Amount makes transients recover faster and sustained material slower. Amount is remembered while off.',

  emphasis:
    'How strongly release adapts to the material when Emphasis is on. Higher = more difference between punchy hits and long notes.',

  gr:
    'Deepest gain reduction across all active band strips and the final broadband limiter (dB). Short spikes on hits are normal; a meter that stays deep means you’re continuously squashing somewhere — louder, but less dynamics.',
} as const;
