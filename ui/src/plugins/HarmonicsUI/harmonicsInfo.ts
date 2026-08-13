/** Hover titles for Harmonics controls (musicians / producers). */

export const harmonicsInfo = {
  bypass:
    'Turns the effect off so you hear the dry path (In/Out gains still apply). A/B whether the saturation/excitement is adding useful density and air — or just grit and mud. Meters keep running.',

  drive:
    'How hard the waveshaper is pushed (Calf/TAP-style saturation). Low = soft warmth and gentle thickening; mid = obvious harmonic density; high = aggressive crunch that can flatten dynamics and eat headroom. Watch the Shape curve bend and the Harmonics bars rise — then balance with Dry/Wet so the track doesn’t just get louder and dirtier.',

  blend:
    'Balances even vs. odd harmonics in the waveshape (−10…+10). Toward “2nd” (positive) = warmer, rounder, more “tube/tape” — often flattering on bass, vocals, and buses. Toward “3rd” (negative) = edgier, more aggressive odd-order grit — cuts through on guitars, synths, and bright exciters. Near 0 = a mix of both. Use the Harmonics bars as a quick map of which overtones you’re feeding the mix.',

  dry:
    'Level of the raw input in the output mix (dB). Untouched by Feed/Post — true parallel dry. Keep high so the original punch stays while Wet adds color; pull down toward mute if you want less of the source under the effect. With Wet also at 0 dB and filters off, Dry+Wet reconstructs a full saturator (not a thin “harmonics only” layer).',

  wet:
    'Level of what the effect path adds (dB): post(waveshaper(feed)) minus the same path without the waveshaper. That delta is why Dry can stay raw and Dry+Wet won’t notch when you sweep filters — you’re not stacking two copies of the same band. Raise for more color; lower for a subtle varnish.',

  pre:
    'Frequency range into the waveshaper only (Linkwitz-Riley HP/LP on the wet path). Does not filter Dry. High-pass for an Exciter so only air/highs are driven; low-pass for bass enhancement; Off = full-range sat send. Use Feed Listen to audition the send band.',

  post:
    'Frequency range after the waveshaper on the wet path only (Linkwitz-Riley HP/LP). Trims or focuses the shaped signal before it is compared to the clean feed→post reference and mixed with Dry. Matching Post to Feed (e.g. both HP ~7.5 kHz) keeps an Exciter in the air lane; a Post LP ceiling tames fizz. Does not filter Dry. Use Post Listen to hear what Wet adds.',

  preListen:
    'Solos the Feed band into the waveshaper. Hear what you’re driving — rumble, body, or air — without the full mix. Tune Feed, then turn Listen off. Exclusive with Post Listen.',

  listen:
    'Solos what Wet adds (shaped wet minus clean wet), × Wet level. Hear grit, sheen, or bass bloom in isolation. If it’s harsh or empty, reshape Drive/Blend or the filters. Exclusive with Feed Listen.',

  presets:
    'Starting points. Wide ≈ full-range sat (Dry muted, Wet +3 dB, filters off). Exciter ≈ Feed HP 3 kHz @ 24 dB, Post HP 5.5 kHz @ 12 dB — air/bite. Bass ≈ Feed LP 150 Hz @ 24 dB, Post LP 100 Hz @ 12 dB — low weight. Treat them as recipes; finish with Drive, Blend, and Dry/Wet.',

  curve:
    'Transfer curve of the waveshaper (input → output). Soft heatmap = where the feed has been living on the curve (fading density). Thicker active zone = how far the current level reaches into the bend (−A…+A). Drive steepens the curve; Blend skews even/odd symmetry. Not a spectrum — a picture of how hard the waveshape is being worked.',

  bars:
    'Relative strength of the 2nd…6th harmonics for a unit sine through the current Drive/Blend shape (normalized overview, not a live audio meter). Tall 2nd = warm/round; tall 3rd/5th = edgier grit. Use it to aim Blend and to check that you’re generating the overtones you want before they hit the mix — then confirm by ear with Dry/Wet and Listen.',
} as const;
