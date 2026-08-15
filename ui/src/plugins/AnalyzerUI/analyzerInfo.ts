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
    'Display tilt pivoted at 1 kHz. Linear = raw dBFS. −3 dB/oct ≈ pink / classic balance (looks flat). −4.5 dB/oct ≈ modern/bass-heavy masters (SPAN default). Tilted views show a filled midband ±9 dB corridor as a balance guide. DSP spectrum floor is −120 dBFS; the chart shows −96…0 so tilted silence stays below the plot and does not draw a rising baseline.',
};
