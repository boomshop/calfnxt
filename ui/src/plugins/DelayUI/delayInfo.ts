/** Hover titles for Delay controls (musicians / producers). */

export const delayInfo = {
  active:
    'Arms the delay lines. Off = no new echoes are written (existing repeats can still fade out); dry stays audible.',
  mixMode:
    'How left and right delay lines are wired. Stereo = independent L/R; Ping-Pong = echoes bounce sides; L then R / R then L = sequential routing across channels.',
  subdiv:
    'How many delay units fit in one beat. Higher = shorter steps (e.g. 16ths). Delay times are Subdivide × Time L/R relative to tempo.',
  timeL:
    'Left delay length in subdiv units (1…16). Longer = later first echo on L (and related taps depending on mix mode).',
  timeR:
    'Right delay length in subdiv units (1…16). Often set differently from L for syncopation or ping-pong spacing.',
  sync:
    'Lock tempo to the host transport when available. On = BPM follows the DAW; manual Tempo / Beat ms / Tap are ignored.',
  tempo:
    'Project tempo for delay timing (BPM). Linked to Beat ms. Disabled while Host Sync is locked to a valid host tempo.',
  beatMs:
    'Length of one beat in milliseconds (linked to Tempo). Handy when you think in ms instead of BPM.',
  tap:
    'Tap several times to set Tempo from your clicks. Ignored while Host Sync is locked.',
  feedback:
    'How much of each echo is fed back for more repeats. Higher = longer trails; near 1 can build up or self-oscillate.',
  width:
    'Stereo spread of the wet echoes (−1…+1). Toward the edges = more L/R separation; center = more mono wet.',
  dry:
    'Level of the un-delayed signal. Balance against Wet for how much direct sound you keep.',
  wet:
    'Level of the delayed (wet) signal. Higher = louder echoes.',
} as const;
