/** Hover titles for Delay controls (musicians / producers). */

export const delayInfo = {
  active:
    'Arms the delay lines. Off = no new echoes are written (existing repeats can still fade out); dry stays audible. Handy for muting the effect in a section without killing the trail instantly.',

  mixMode:
    'How left and right delay lines are wired. Stereo = independent L/R echoes (classic dual delay). Ping-Pong = repeats bounce sides — wide rhythmic movement. L then R / R then L = sequential routing across channels for cascading, asymmetric rhythms.',

  subdiv:
    'How many delay units fit in one beat. Higher = shorter steps (e.g. 16ths feel snappier). Delay times are Subdivide × Time L/R relative to tempo — so this is the “grid resolution” for the Time knobs.',

  timeL:
    'Left delay length in subdiv units (1…16). Longer = later first echo on L (and related taps depending on mix mode). Offset L vs R for syncopation, groove, or ping-pong spacing.',

  timeR:
    'Right delay length in subdiv units (1…16). Set differently from L for polyrhythmic or cascading delays; match L for a simple stereo slap.',

  sync:
    'Lock tempo to the host transport when available. On = BPM follows the DAW so delays stay in time when you change project tempo. Manual Tempo / Beat ms / Tap are ignored while locked to a valid host tempo.',

  tempo:
    'Project tempo for delay timing (BPM). Linked to Beat ms. Disabled while Host Sync is locked. Set this when working offline or without a reliable host tempo.',

  beatMs:
    'Length of one beat in milliseconds (linked to Tempo). Handy when you think in ms (“quarter note ≈ 500 ms at 120 BPM”) instead of BPM numbers.',

  tap:
    'Tap several times to set Tempo from your clicks — useful for matching a riff by feel. Ignored while Host Sync is locked.',

  feedback:
    'How much of each echo is fed back for more repeats. Low = one or two slapbacks; high = long trails that fill the space. Near 1 can build up or self-oscillate — musical as a special effect, dangerous on a full mix. Filter the feedback path (if available in the filter section) to keep high feedback from getting harsh or muddy.',

  width:
    'Stereo spread of the wet echoes (−1…+1). Toward the edges = more L/R separation and width; toward center = more mono-safe wet. Extreme width can disappear in mono — check mono compatibility on important delays.',

  dry:
    'Level of the un-delayed signal. Turn down for a wetter, more ambient feel; keep high when the delay should sit behind a clear lead.',

  wet:
    'Level of the delayed signal. Higher = louder echoes. Balance with Dry so repeats support the performance instead of competing with it.',
} as const;
