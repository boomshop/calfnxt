/** Hover titles for Limiter controls (musicians / producers). */

export const limiterInfo = {
  bypass:
    'Turns the limiter off so you hear the dry signal with no delay and no gain reduction. Use this to A/B whether the limiting is helping or squashing the mix.',

  limit:
    'The loudness ceiling. Lower = more of the signal hits the wall and gets turned down — the mix gets denser and “louder” sounding, but peaks lose headroom. With Auto Level on, turning Limit down also boosts the overall level so the ceiling still sits at full scale.',

  attack:
    'How far ahead the limiter looks before a peak arrives. Longer = it can pull gain down earlier, so hard hits feel smoother and less “clipped”; shorter = more punch left on the attack, but more risk of a brief overshoot or harder grab. Longer look also means more latency in the DAW.',

  release:
    'How fast level comes back up after a peak. Fast = punchy and lively, but can pump (breathing on vocals, bounce on bass). Slow = calmer and more glued, but the whole mix can stay quieter for longer after loud hits.',

  asc:
    'Adaptive release that listens to recent peaks instead of always recovering the same way. On dense material it often sounds more natural and less “bouncey” than a fixed release — especially on full mixes and drums.',

  ascCoeff:
    'How strongly ASC reshapes the release. Higher = recovery aims more toward the average loudness of recent peaks (often smoother on busy tracks). Lower = closer to a classic fixed release. Tweak while watching/hearing whether the GR meter “chatters” or rides smoothly.',

  oversampling:
    'Runs the limiter at a higher internal sample rate so sharp peaks between samples are caught better. Higher settings can sound a bit cleaner/safer on bright transients and mastered material; 1× is lighter on CPU. Turning the knob briefly crossfades while filters rebuild.',

  autoLevel:
    'When on, lowering the Limit automatically makes up the loudness so the output still peaks near 0 dB. That makes Limit feel like a “how hard do I smash” control. When off, Limit is a real quieter ceiling and the mix just gets quieter as you pull it down.',

  curve:
    'The shape of the gain ride into and out of peaks. Linear = even, straightforward. Log = more “leveling” feel in dB (often smoother on program). Cos = soft ease-in/out — usually the gentlest, least abrupt grab. Switch while looping a drum hit or chorus and listen for hardness vs. glue.',

  knee:
    'Softens the brickwall. 0 dB = hard stop — maximum loudness and a very clear “hit the ceiling” feel. Higher knee = reduction starts earlier and eases in, so limiting is less obvious and more compressed/glued, with a bit less absolute peak loudness. (0 is a real mode, not “off”.)',

  colorEnable:
    'Turns on pre-limit saturation. Off = clean path into the brickwall; on = Color Amount shapes density/warmth. The Amount knob keeps its value while disabled so you can A/B without losing the setting.',

  color:
    'How much soft saturation before the limiter. Low = subtle glue; high = obvious drive. Only active when Color is switched on.',

  truePeak:
    'Turns on true-peak limiting (at least 2× oversampling + Margin). Off = classic sample-peak brickwall (louder possible). On = safer for streaming/bounces where inter-sample peaks would otherwise clip.',

  margin:
    'Extra safety under the Limit while True Peak is on. Small (≈0.1 dB) stays loud; larger is cleaner after export but leaves more unused headroom. Only applies when True Peak is enabled.',

  diffListen:
    'Lets you hear only what the limiter removes (dry minus limited). Loud, clicky, or tonal junk here means you’re taking a lot away — often too much. Clean, brief “tick” on hits means tasteful peak control. Great for setting Limit / Knee / Color by ear.',

  holdEnable:
    'Turns on Release Hold. Off = release starts immediately after a peak; on = Time sets how long gain stays down first. Keeps the Time setting while disabled for easy A/B.',

  releaseHold:
    'How long gain reduction stays down after a peak before release. Helps vocals not pump after consonants. Too much can duck the mix after every hit. Only active when Hold is on.',

  emphasisEnable:
    'Turns on program-dependent release. Off = fixed Release time; on = Amount makes transients recover faster and sustained material slower. Amount is remembered while off.',

  emphasis:
    'How strongly release adapts to the material when Emphasis is on. Higher = more difference between punchy hits and long notes.',

  gr:
    'How many dB the limiter is currently turning the signal down. Short spikes on hits are normal; a meter that stays deep means you’re continuously squashing — louder, but less dynamics.',
} as const;
