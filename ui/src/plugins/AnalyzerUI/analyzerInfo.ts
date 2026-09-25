export const analyzerInfo = {
  bypass:
    'Turns the spectrum and goniometer off (audio still passes; In/Out gains still apply). Loudness and true peak keep running, so a bypass A/B does not wipe the integrated measurement. Use it when you want the picture frozen and the CPU back.',
  waterfall:
    'Replaces the curve chart with a scrolling waterfall (frequency left to right, time upward). L/R, RMS and peak-hold step aside while it is on. The L−R strip, meters and goniometer stay. Leave it off while reading the curves — the waterfall is the heavier paint.',
  pause:
    'Stops integrated loudness, LRA and the measurement clock. Momentary, short-term and the live true-peak bars keep moving so you can cue. Max true peak stays where it was until you resume or reset.',
  reset:
    'Clears integrated loudness, LRA, the clock and the true-peak / sample-peak maximums. The spectrum peak-hold is a separate reset.',
  resetPeak:
    'Clears the white dashed spectrum peak trace. It stays latched (no slow decay) until the next reset, so the hottest bin of the pass remains visible.',
  fftSize:
    'FFT size: larger = finer low-frequency detail and slower updates; smaller = snappier / less bass resolution. 4k is the default at 48 kHz; 8k helps resolve sub/bass further (more CPU). 1k/2k when you want a quicker display. This is the main CPU knob — L and R are both transformed.',
  scale:
    'Display tilt pivoted at 1 kHz so a balanced mix reads roughly as a horizontal line. Linear = raw dBFS (natural treble roll-off). −3 dB/oct ≈ typical pop / general programme. −4.5 dB/oct ≈ modern, bass-heavy material. Tilted views also show a midband ±9 dB corridor as a balance guide. The L−R strip below ignores tilt.',
  standard:
    'Loudness target and true-peak mark. The measurement itself stays ITU-R BS.1770-4. EBU R128 = −23 LUFS / −1 dBTP. ATSC A/85 = −24 LKFS / −2 dBTP. −14 and −16 are the streaming ceilings (about  −1 dBTP) most music masters are checked against.',
  curves:
    'Four traces at once. Accent is left, warn is right (both ~100 ms). The solid neutral curve is a slower RMS body (~1 s, power in each band, L+R). The white dashed line is the latched peak of the mid and only clears with Reset Peak.',
  diff:
    'Left minus right, in dB, same frequency axis as the main chart. Above the centre line the left is hotter (accent fill); below, the right is hotter (warn fill). A flat line on zero is a centred, matching spectrum. Wide stereo or a one-sided problem shows up here without switching modes.',
  gonio:
    'Goniometer (vectorscope): each sample is plotted as L vs R. A vertical line is mono (center); a cloud that fans left/right is wider stereo. Circles/ellipses suggest phase rotation; a thin diagonal or inverted blob often means polarity / out-of-phase issues. Use it to judge image width and mono risk at a glance.',
  corr:
    'Stereo correlation (−1…+1). Near +1 = highly mono-compatible (L and R move together). Around 0 = wide / diffuse. Negative values mean out-of-phase content that can cancel in mono — watch the low end especially. A healthy master usually sits positive; brief dips are fine, sustained negatives are a red flag.',
  truePeak:
    'Inter-sample peak (4× oversampling, ITU-R BS.1770). The bar is the latest peak, the number on the right is the maximum since Reset. The mark on the scale is the ceiling of the selected standard. Past that mark is a streaming or broadcast over, even when the sample peak is still under 0 dBFS.',
  integrated:
    'Integrated loudness since Reset (gated, BS.1770). The small figure next to it is the offset from the selected target: positive means louder than the target. Momentary (400 ms) and short-term (3 s) sit beside it ungated. LRA is the loudness range of the short-term values (EBU Tech 3342) and stays blank until the measurement has settled. Time is audio time, and it pauses with Pause.',
};
