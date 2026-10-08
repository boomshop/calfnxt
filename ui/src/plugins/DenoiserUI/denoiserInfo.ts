/** Hover titles for Denoiser controls (musicians / producers). */

export const denoiserInfo = {
  bypass:
    'Turns Denoiser off while keeping plugin latency so timing stays aligned with the rest of the chain. Use it to A/B whether the noise floor really dropped — or whether you also lost air, room, and low-level detail you still wanted.',

  diffListen:
    'Solo what Denoiser removes (delayed dry minus wet). You want hiss, hum, fan, tape, and room floor — not the body of the vocal, bass, or instrument. If Diff Listen sounds like the dry track, back off Amount, raise Floor, or tighten Low/High so the subtract only hits the noise band. Exclusive with profile Listen: turning Diff Listen on clears a slot Listen, and vice versa.',

  profile:
    'Which of the three learned noise fingerprints is the active target (1 / 2 / 3). Blend morphs toward this slot over the Blend time. Capture a quiet bed into a slot with Learn, then park Profile on that slot for processing. Switch slots when the noise character changes (verse vs chorus, different room takes).',

  blend:
    'How long the active profile morphs when you change Profile or after a fresh Learn (10…5000 ms). Short = snappy slot changes — can click if the two fingerprints differ a lot. Long = smooth crossfade between noise shapes so the subtract eases in without pumping the tone. Start around a few hundred ms on vocals; go longer on beds that drift.',

  amount:
    'How hard spectral subtraction pushes toward the noise profile (0…1). Full = maximum chase of the fingerprint inside Low…High. Lower = gentler cleanup that leaves more of the source’s own quiet detail. Push Amount only after Diff Listen shows mostly noise; if you hear consonants or note body in the solo, pull Amount back or raise Floor (toward 0 dB).',

  floor:
    'Minimum spectral gain in dB (−60…0). The subtract never digs below this floor — −20 dB ≈ leave at least 10% of the bin energy. Closer to 0 = gentler (more noise left, safer for vocals). Closer to −60 = allow deep cuts when Amount is high (tighter denoise, more risk of underwater artifacts). Raise Floor if Diff Listen starts chewing air or soft tails.',

  fLo:
    'Low edge of the processing window (left chart handle) — fixed 24 dB high-pass on what Denoiser is allowed to subtract. Raise Low to protect rumble, kick, and chest that should not be treated as noise. Lower it if the problem lives under the current edge (AC hum, traffic, tape rumble). Outside the window the subtract fades with the filter skirts. Turn Low off (Process toggle) to open the bottom of the band completely.',

  fLoOn:
    'Engages the Low (high-pass) edge of the denoise window. On = chart Low handle and soft HP skirt limit how far down subtraction reaches. Off = no low wall — processing runs from DC up to High (or full-band if High is also off). Park it off when the noise is broadband and you do not need to protect the bottom; leave it on when you want a clear rumble/chest floor the subtract must not chew.',

  fHi:
    'High edge of the processing window (right chart handle) — fixed 24 dB low-pass complementary to Low. Cap so air, hiss above the problem, or bright vocal detail outside the noise band is not chewed. On dialogue or sung voice, parking High around a few hundred Hz to low-kHz often catches bed noise without eating presence; open it when the noise is broadband hiss. Turn High off (Process toggle) to open the top of the band completely.',

  fHiOn:
    'Engages the High (low-pass) edge of the denoise window. On = chart High handle and soft LP skirt cap how far up subtraction reaches. Off = no high wall — processing runs from Low (or DC if Low is also off) up to Nyquist. Use Off for full-band hiss beds; leave On when you want presence/air above the problem left alone.',

  quality:
    'Analysis / process FFT size vs latency. Fast = 1k (snappy, coarser low end, least PDC). Normal = 2k (balanced default). Studio = 4k (finer low-mid fingerprint detail). Ultra = 8k (finest resolution; ~2× Studio latency and CPU — only when you need it and can afford the PDC). Same FFT for the chart and the subtract.',

  spectrum:
    'Display tilt for the background analyzer and profile lines only (does not change the sound), pivoted at 1 kHz. Linear = raw dBFS. −3 / −4.5 dB/oct ≈ pink-balanced views so a flat bed reads more horizontal and midrange noise is easier to spot against the GR stroke.',

  learn:
    'Hold Learn on while you feed a quiet noise bed into this slot — room tone, pre-roll, fan, tape hiss, not the performance. Denoiser averages the spectrum for as long as Learn stays on; turn it off to freeze the fingerprint. A second Learn on the same slot continues the average (adds more bed into the same footprint). Clear first if you want a fresh capture from scratch. Exclusive across slots: engaging Learn on another card finalizes this one first. After Learn, set Profile to this slot and check Diff Listen — the solo should be the bed, not consonants or notes.',

  listen:
    'Solo this slot’s learned profile as the processing key (profile listen). Use it to check that the fingerprint looks and sounds like the noise you meant to capture — not the music. Exclusive with Diff Listen and with the other slots’ Listen: only one listen mode at a time. Turning Diff Listen on clears slot Listen.',

  clear:
    'Wipe this profile slot’s learned noise fingerprint. Confirm (second click) before clearing if you still need it. The mini chart empties immediately; if this was the active Profile, subtraction drops that target right away. After clear, Learn a new bed or switch Profile to another valid slot — an empty active slot means no useful subtract target.',

  selectCard:
    'Click the card (or use the Profile knob) to make this slot the active target. Highlighted = Profile matches this slot. The mini chart is that slot’s learned noise fingerprint (averaged spectrum from Learn) — not the live input analyzer. Empty cards stay flat until you Learn; Clear wipes the fingerprint from the mini and from processing if this was the active Profile.',
} as const;
