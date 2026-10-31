/**
 * Big numbers, the way RUN's Big Numbers API writes them (K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc,
 * then 1.2e36): three significant figures, so a score reads at a glance as it explodes.
 */
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function big(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const sign = n < 0 ? '-' : '';
  const v = Math.abs(n);
  if (v < 1000) return sign + String(Math.floor(v));
  const tier = Math.floor(Math.log10(v) / 3);
  if (tier >= SUFFIXES.length) return sign + v.toExponential(1).replace('+', '');
  const scaled = v / 10 ** (tier * 3);
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  // Round down, so 999,999 never shows as "1000K".
  const f = 10 ** digits;
  return sign + (Math.floor(scaled * f) / f).toFixed(digits) + SUFFIXES[tier];
}
