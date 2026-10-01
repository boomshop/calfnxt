/**
 * Knob readout for frequency (Hz): at most 5 digits total, at most 2
 * fractional digits — e.g. 1.23 / 12.34 / 123.45 / 1234.5 / 12345.
 */
export function formatHz(hz: number): string {
  if (!Number.isFinite(hz)) return '—';
  const sign = hz < 0 ? '-' : '';
  const v = Math.abs(hz);
  // Leading 0 before the decimal counts as one digit (0.xx).
  const intDigits = v >= 1 ? Math.floor(Math.log10(v)) + 1 : 1;
  const frac = Math.min(2, Math.max(0, 5 - intDigits));
  return sign + v.toFixed(frac);
}
