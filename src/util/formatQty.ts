/** "2", "½", "2¾" — whole packs plus an optional quarter fraction (never zero). */
export function formatQty(qty: number): string {
  const whole = Math.floor(qty);
  const frac = Math.round((qty - whole) * 4) / 4;
  const FRAC: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
  const bit = FRAC[frac];
  if (whole === 0 && bit) return bit;
  if (!bit) return String(whole);
  return `${whole}${bit}`;
}
