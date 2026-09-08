export const impulseInfo = {
  bypass:
    'Turns the convolution path off so you hear dry only (In/Out gains still apply). Latency stays reported while an IR is loaded so the host graph does not jump. A/B the room without unloading the file.',

  source:
    'What feeds the IR — dry stays the original stereo so an insert does not collapse the source. Stereo = L and R independently (true-stereo files use all four paths). L or R = that channel into both convolver inputs: a mono send from one side, or a true-stereo hall “from the left/right speaker.” L+R = (L+R)/2 into both — the usual vocal/bus mono-into-the-room without a 6 dB bump when the sides agree. On a send you will often want L+R even on a stereo track so the image of the dry is not baked into the wet twice. Stereo IRs still come back as stereo from a mono feed; they just share one source.',

  quality:
    'CPU vs how much of the IR’s spatial wiring actually runs. Rebuilds the engine like Decay, so it is not a click-free live stutter — flip it while stopped if the host is picky. Hop latency stays 512 samples either way.\n\n' +
    'Lo — one mono impulse: stereo files become (L+R)/2, true-stereo files (LL+RR)/2. About 2× cheaper than Mid and 4× cheaper than Hi on a 4-channel hall. The wet image is the same in both speakers; use it for stacks of instances, mono sends, or a weak CPU. A mono WAV does not get cheaper.\n\n' +
    'Mid — stereo L/R only. True-stereo files keep LL and RR and drop the wrap-around (L→R / R→L). Half the work of Hi, still a left/right room. Typical stereo IRs already are this.\n\n' +
    'Hi — default / as captured. Four-channel true-stereo IRs use all paths (L→L, L→R, R→L, R→R). Leave it here when the file is the featured space and CPU allows.',

  decay:
    'Shortens the captured tail without inventing extra reverb. 100% = the IR as recorded — no extra fade, and the overlay on the waveform disappears. Lower values apply a fade and truncate: the hall dies earlier, denser, less wash. Shape is how that extra envelope falls; the handle on the waveform is this same length control. Loading another file snaps Decay back to 100% (and turns Reverse off) so you hear the new capture as it is. Dragging past the original length does nothing: a measured IR cannot honestly get longer. If the room vanished, you went too short; if it still clouds the source, go further down and check Mix.',

  shape:
    'How the extra Decay envelope falls from the start of the IR to the cut. Only does anything below 100% Decay — at 100% there is no attenuation. 1 is a straight drop in dB: the tail thins immediately. Higher values stay louder longer, then drop harder toward the cut — 2 is quadratic, 8 hangs on almost the whole way and then falls off a cliff. Default 4 keeps more of the early room. Same length either way; use a little Shape when you want the start to stay, more when the tail is wash. Dragging rebuilds the engine like Decay.',

  predelay:
    'Extra silence in front of the wet IR (on top of the convolver’s own hop latency). Keeps a vocal or snare in front of the room before the first reflection. The waveform on the chart starts at this time — the x-axis always covers the IR plus 500 ms of headroom so the scale does not jump while you drag. The dry path is delayed to the convolution hop so Mix does not comb at time zero; this knob only pushes the wet later. 0 = IR timing as captured; 20–60 ms is a typical vocal slot; large values become an audible slap before the hall.',

  reverse:
    'Plays the IR backwards before convolution — the classic reverse-reverb bloom (swell into the hit, then cut). Decay still shortens the original tail first, then the clip is reversed, so the handle on the waveform is the same cut. Rebuilds the engine, so it is not a click-free live stutter; flip it while stopped if the host is picky. Combine with Predelay so the swell lands on the downbeat. Off = natural room direction. Choosing a different IR turns this off automatically.',

  hipass:
    'High-pass on the wet IR only. Rolls rumble and muddy bloom out of the hall without thinning the dry source. Use when a church IR blooms the kick or a plate makes the vocal chesty. Too high and the room becomes small and hissy — you are hearing the IR’s noise floor.',

  lopass:
    'Low-pass on the wet IR only. Darkens a brittle or overly bright hall (stone, tiled, cheap impulse). Complements HP: together they are a wet-only frequency range, even-order slopes that do not comb against dry. If the space disappeared, you filtered out the body of the IR.',

  hpMode:
    'Slope of the wet high-pass. Off = no HP. 12 / 24 / 48 dB Linkwitz–Riley (36 maps to 24 — odd order cannot sit clean against dry). Steeper = tighter rumble cut, more phase rotation in the wet. Start at 12 dB unless the IR is a basement.',

  lpMode:
    'Slope of the wet low-pass. Off = no LP. Same even-order LR family as HP. 12 dB is a gentle darken; 48 dB is a hard lid on a fizzy impulse. Listen in mono if you push both HP and LP hard — the wet image can collapse a little.',

  dry:
    'Level of the latency-matched dry path. 0 dB = unity with In gain. Drop it on an aux/send where the DAW already has the dry; keep it up for insert “in the room” blending. Mute-style: slam it to −60 if you only want the IR on a send.',

  amount:
    'Level of the convolved wet. IRs are peak-normalized on load so one-click switches do not explode; this is the mix trim after that. Typical insert: −12 to −6 dB wet with dry at 0. On a send, push wet up and pull Dry down. If two files still jump in loudness, the IR itself is unusually dense — ride Wet, do not chase In gain.',

  library:
    'Pick the folder that holds your IR collection once. The plugin scans WAV and uncompressed AIFF recursively and shows the tree here — one click loads. Which folders are open and where you scrolled is stored in the session, so reopening the editor lands you in the same place. Filter matches names only (not tags). Rescan after you drop new files in. The current IR is stored in the session even if the file later moves; the tree will show it missing until you point Library at the new place.',

  filter:
    'Name filter for the tree (case-insensitive). Folders stay if a child matches. Clear it to see the whole library again. Does not search inside the WAV — only the filename.',
};
