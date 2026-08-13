/** Hover titles for Compressor controls (musicians / producers). */

export const compressorInfo = {
  bypass:
    'Turns compression off so you hear the dry path (In/Out gains still apply). Use this to A/B whether the compressor is helping glue and control, or just squashing life out of the track.',

  mode:
    'How the detector “hears” level. Peak = reacts to sharp spikes (drums, plosives) — punchy but can pump. RMS = follows average loudness — smoother leveling on vocals/buses. Opto = softer, program-dependent feel — often more musical and less abrupt on complex material.',

  link:
    'How left and right (or mid) share gain reduction. Max = the louder channel wins (keeps image stable, common on buses). Avg = blends both (gentler stereo reaction). Mid = only the mid/center drives GR (sides stay freer — can feel wider, watch mono compatibility).',

  threshold:
    'Level where compression starts. Lower = more of the signal is grabbed — denser, more controlled, less dynamic. Higher = only loud peaks are touched — more open and natural. Watch the GR meter and listen for whether the body of the note is being ridden or only the hits.',

  ratio:
    'How hard levels above threshold are reduced (e.g. 4:1). Low ratios = gentle glue; high ratios = stronger squashing, closer to limiting. Very high ratios can sound obvious or “stuck” if attack/release aren’t matched to the material.',

  attack:
    'How fast gain reduction engages. Fast = grabs transients (tames snare/kick spikes, can dull punch). Slow = lets the attack through then settles — punchier drums and clearer consonants, but peaks can slip past. Loop a hit and listen for snap vs. control.',

  release:
    'How fast gain returns after the signal falls. Fast = lively and punchy, but can pump (breathing on vocals, bounce on bass). Slow = smoother and more glued, but the track can stay ducked after loud moments. Match it so GR recovers between phrases without chattering.',

  pdr:
    'Program-dependent release. Higher = release adapts more to the material (often smoother on busy mixes and less “bouncey” than a fixed fast release). Lower = closer to a classic fixed release time. Useful when one release setting never fits both hits and sustained notes.',

  knee:
    'Softens the onset around threshold. 0 = hard knee — clear “hit into compression.” Higher = gentler, less obvious engagement — more glue, less drama. Soft knee can sound quieter/less aggressive at the same threshold because reduction eases in earlier.',

  makeup:
    'Output gain after compression to restore loudness lost to gain reduction. Turn up until the compressed signal matches dry loudness in an A/B — then judge tone, not just “louder = better.”',

  mix:
    'Dry/wet blend for parallel compression. Lower = more dry punch under a squashed wet path (New York style). 100% = fully compressed. Great when full wet feels too flat but you still want density.',

  gr:
    'How many dB the compressor is currently pulling down. Short spikes on hits are normal; a meter that stays deep means you’re continuously riding the body of the sound — louder/denser, but less dynamics.',
} as const;
