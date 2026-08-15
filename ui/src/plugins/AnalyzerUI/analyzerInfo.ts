export const analyzerInfo = {
  bypass:
    'Turns analysis taps off (audio still passes; In/Out gains still apply). Use to freeze CPU briefly or A/B without the meters updating.',
  mode:
    'Spectrum display: Average / Stereo use EMA smoothing (~100 ms). Max is peak-hold. Difference is calm L−R dB. Spectralizer is a scrolling waterfall.',
  hold:
    'Freezes the peak-hold spectrum (no decay). Useful in Average / Max / Stereo to compare peaks while the live curve keeps moving. Turning Hold off clears the peak buffer so the next Hold starts fresh.',
  fftSize:
    'FFT size: larger = finer low-frequency detail and slower updates; smaller = snappier / less bass resolution. 2k is a good default at 48 kHz; 8k helps resolve sub/bass further (more CPU).',
  scale:
    'Display tilt pivoted at 1 kHz so a balanced mix reads roughly as a horizontal line. Linear = raw dBFS (natural treble roll-off). −3 dB/oct ≈ typical pop / general programme. −4.5 dB/oct ≈ modern, bass-heavy material. Tilted views also show a midband ±9 dB corridor as a balance guide.',
  gonio:
    'Goniometer (vectorscope): each sample is plotted as L vs R. A vertical line is mono (center); a cloud that fans left/right is wider stereo. Circles/ellipses suggest phase rotation; a thin diagonal or inverted blob often means polarity / out-of-phase issues. Use it to judge image width and mono risk at a glance.',
  corr:
    'Stereo correlation (−1…+1). Near +1 = highly mono-compatible (L and R move together). Around 0 = wide / diffuse. Negative values mean out-of-phase content that can cancel in mono — watch the low end especially. A healthy master usually sits positive; brief dips are fine, sustained negatives are a red flag.',
};
