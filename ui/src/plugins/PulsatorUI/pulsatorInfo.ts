export const pulsatorInfo = {
  bypass: 'Bypass the modulator. LFOs keep running so the return is in phase.',
  mono: 'Sum L+R to mono before modulation — true autopanner on stereo sources.',
  mode: 'LFO waveform: Sine, Triangle, Square, Saw up, Saw down.',
  amount:
    'Modulation depth. 100% = classic tremolo (0…1 gain); lower values blend dry.',
  pulseWidth:
    'Waveform cycles per LFO period (⅛ / ¼ / ½ / 1 / 2). Narrower = shorter pulse.',
  offsetL: 'LFO phase offset for the left channel (0…100%).',
  offsetR:
    'LFO phase offset for the right channel. Default 50% = classic autopanner.',
  sync:
    'Lock rate to the host transport when available. On = Tempo follows the DAW. Manual Tempo / Beat ms / Tap are ignored while locked to a valid host tempo.',
  tempo:
    'LFO rate in BPM (one cycle per beat). Linked to Beat ms. Range 0.5…300 BPM (~2 min…0.2 s per cycle) for slow autopans. Disabled while Host Sync is locked.',
  beatMs:
    'LFO period in milliseconds (200 ms…2 min). Linked to Tempo. Disabled while Host Sync is locked.',
  tap: 'Tap several times to set Tempo from your clicks. Ignored while Host Sync is locked.',
  reset: 'Reset both LFO phases to zero.',
};
