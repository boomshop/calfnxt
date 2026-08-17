/** Hover titles for Ring Modulator controls (musicians / producers). */

export const ringmodInfo = {
  bypass:
    'Turns the effect off so you hear dry input (In/Out gains and meters still work). Use this to A/B whether the ring modulation is adding useful grit or just clutter.',

  modMode:
    'Carrier waveform. Sine is the classic metallic ring-mod. Triangle is softer. Square is harsher / more digital. Saw up/down skew the sidebands — try them when sine feels too “clean” or sterile.',

  modFreq:
    'Carrier frequency in Hz. Low values (tens–hundreds) = slow tremolo-ish / gurgly sidebands. Mid = classic radio / sci-fi metallic. High = thin, buzzy, almost AM radio. With LFO 1 → Frequency active, this knob is the center of the sweep between Min and Max.',

  modAmount:
    'How hard the carrier multiplies the input (0 = dry, 1 = full ring). Soft amounts keep body; high amounts get hollow and clangy. With LFO 2 → Amount active, this is overridden by the LFO range.',

  modPhase:
    'Stereo phase offset of the right carrier vs left (0…1 = 0…360°). 0.5 = opposite phase — widens the stereo image of the modulation. 0 = mono carriers.',

  modDetune:
    'Splits left/right carrier by cents (L up, R down). Small values = slow chorusing beat. Larger = obvious stereo “two oscillators”. With LFO 1 → Detune active, this knob is replaced by the LFO range.',

  modListen:
    'Solos the carrier (no input) so you can tune Frequency / Waveform / Detune / Phase by ear before blending Amount back in.',

  lfo1Freq:
    'Rate of LFO 1. Slow = long sweeps of Frequency or Detune. Faster = vibrato / warble on the carrier. Can itself be swept by LFO 2.',

  lfo1Mode: 'Waveform for LFO 1 — same palette as the modulator.',

  lfo1Reset: 'Resets LFO 1 phase to zero — useful to sync sweeps to a downbeat.',

  lfo1ModFreq:
    'When Active, LFO 1 sweeps Modulator Frequency between Min and Max (log-friendly Hz range). Classic auto-wah-style ring-mod motion.',

  lfo1ModDetune:
    'When Active, LFO 1 sweeps stereo Detune between Min and Max cents — living width without touching Frequency.',

  lfo2Freq: 'Rate of LFO 2 — typically slower; used to move LFO 1 rate and/or Amount.',

  lfo2Mode: 'Waveform for LFO 2.',

  lfo2Reset: 'Resets LFO 2 phase to zero.',

  lfo2Lfo1Freq:
    'When Active, LFO 2 sweeps LFO 1’s frequency between Min and Max — nested modulation for less predictable motion.',

  lfo2ModAmount:
    'When Active, LFO 2 sweeps Modulator Amount between Min and Max — the effect breathes in and out of the dry signal.',
} as const;
