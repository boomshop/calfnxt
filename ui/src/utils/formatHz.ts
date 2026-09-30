/**
 * Knob readout for frequency (Hz): at most 6 digits total, at most 3
 * fractional digits — e.g. 1.234 / 12.345 / 123.456 / 1234.56 / 12345.6.
 */
export function formatHz(hz: number): string {
  if (!Number.isFinite(hz)) return '—';
  const sign = hz < 0 ? '-' : '';
  const v = Math.abs(hz);
  // Leading 0 before the decimal counts as one digit (0.xxx).
  const intDigits = v >= 1 ? Math.floor(Math.log10(v)) + 1 : 1;
  const frac = Math.min(3, Math.max(0, 6 - intDigits));
  return sign + v.toFixed(frac);
}
