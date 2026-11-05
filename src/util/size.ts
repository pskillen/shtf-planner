import { MEASURE_UNITS, type Measure, type Size, type SizeUnit } from '../model';

/** g, ml or pieces: the base unit a size counts in. */
const FACTOR: Record<SizeUnit, number> = { g: 1, kg: 1000, ml: 1, L: 1000, pieces: 1 };

/** The total of a size in its base unit (g, ml or pieces): `count` × `amount`. */
export function baseAmount(size: Size): number {
  return (size.count ?? 1) * size.amount * FACTOR[size.unit];
}

/** Whether a size uses a unit of the measure (mass: g, kg; volume: ml, L; count: pieces). */
export function sizeFits(size: Size, measure: Measure): boolean {
  return MEASURE_UNITS[measure].includes(size.unit);
}

/** The measure a unit belongs to. */
export function measureOfUnit(unit: SizeUnit): Measure {
  return unit === 'g' || unit === 'kg' ? 'mass' : unit === 'ml' || unit === 'L' ? 'volume' : 'count';
}

const trim = (n: number): string => String(Math.round(n * 100) / 100);

/** "415 g", "24 × 500 ml", "1.5 kg", "8 pieces", "1 piece". */
export function formatSize(size: Size): string {
  const unit = size.unit === 'pieces' && size.amount === 1 && !size.count ? 'piece' : size.unit;
  const one = `${trim(size.amount)} ${unit}`;
  return size.count ? `${size.count} × ${one}` : one;
}

/** Equal total, same unit family and same count (500 g equals 0.5 kg; 6 × 1 L does not equal 6 L). */
export function sameSize(a: Size, b: Size): boolean {
  return (
    measureOfUnit(a.unit) === measureOfUnit(b.unit) &&
    (a.count ?? 1) === (b.count ?? 1) &&
    Math.abs(baseAmount(a) - baseAmount(b)) < 1e-9
  );
}

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const TEXT = new RegExp(
  String.raw`(?:(\d+)\s*[x×*]\s*)?(${NUMBER})\s*(kg|g|ml|cl|l|litres?|liters?|pieces?|pcs?)(?![a-z])`,
  'i',
);

const toNumber = (s: string): number => parseFloat(s.replace(',', '.'));

/** A unit word as a size unit, with the factor that turns the amount into that unit. */
function unitOf(word: string): { unit: SizeUnit; factor: number } | undefined {
  switch (word.toLowerCase()) {
    case 'g':
      return { unit: 'g', factor: 1 };
    case 'kg':
      return { unit: 'kg', factor: 1 };
    case 'ml':
      return { unit: 'ml', factor: 1 };
    case 'cl':
      return { unit: 'ml', factor: 10 };
    case 'l':
    case 'litre':
    case 'litres':
    case 'liter':
    case 'liters':
      return { unit: 'L', factor: 1 };
    case 'piece':
    case 'pieces':
    case 'pc':
    case 'pcs':
      return { unit: 'pieces', factor: 1 };
    default:
      return undefined;
  }
}

function make(count: number | undefined, amount: number, word: string): Size | undefined {
  const u = unitOf(word);
  if (!u || !Number.isFinite(amount) || amount <= 0) return undefined;
  const size: Size = { amount: Math.round(amount * u.factor * 1000) / 1000, unit: u.unit };
  if (count !== undefined && count >= 2) size.count = count;
  return size;
}

/**
 * Open Food Facts' quantity text, or its `product_quantity` + unit, as a size; undefined when
 * unreadable. The text comes first because it carries a multipack ("24 x 330 ml"); the number and
 * unit are a single size. `cl` becomes ml and `l` or `litre` becomes L.
 */
export function parseSize(
  text: string | undefined,
  quantity?: number,
  unit?: string,
): Size | undefined {
  if (text) {
    const m = TEXT.exec(text);
    if (m) {
      const size = make(m[1] ? parseInt(m[1], 10) : undefined, toNumber(m[2]!), m[3]!);
      if (size) return size;
    }
  }
  if (quantity !== undefined && Number.isFinite(quantity) && quantity > 0) {
    return make(undefined, quantity, unit?.trim() || 'g');
  }
  return undefined;
}
