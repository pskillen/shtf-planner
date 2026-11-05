import type { ItemType } from '../model';

/** What Open Food Facts told us about a product, as far as matching goes. */
export interface ProductHints {
  /** OFF `categories_tags`, e.g. `en:canned-foods`. */
  categories: string[];
  grams?: number;
  ml?: number;
  name?: string;
}

/** A pack type a category can mean, with its size in grams or millilitres where it has one. */
interface Candidate {
  /** The local id in the `items-base` pack. */
  local: string;
  grams?: number;
  ml?: number;
}

const TINS: Candidate[] = [{ local: 'tinned-food-tin', grams: 400 }];
const PASTA: Candidate[] = [
  { local: 'dried-pasta-500g', grams: 500 },
  { local: 'dried-pasta-1kg', grams: 1000 },
  { local: 'dried-pasta', grams: 5000 },
];
const RICE: Candidate[] = [
  { local: 'rice-1kg', grams: 1000 },
  { local: 'rice-sack', grams: 10000 },
];
const WATER: Candidate[] = [
  { local: 'bottled-water-2l', ml: 2000 },
  { local: 'bottled-water-5l', ml: 5000 },
  { local: 'bottled-water-6x2l', ml: 12000 },
  { local: 'bottled-water', ml: 12000 },
  { local: 'bottled-water-6x5l', ml: 30000 },
];
const OATS: Candidate[] = [
  { local: 'porridge-oats-1kg', grams: 1000 },
  { local: 'porridge-oats', grams: 3000 },
  { local: 'porridge-oats-10kg', grams: 10000 },
];
const PEANUT_BUTTER: Candidate[] = [
  { local: 'peanut-butter-340g', grams: 340 },
  { local: 'peanut-butter', grams: 2000 },
];
const MILK: Candidate[] = [{ local: 'uht-milk', ml: 1000 }];
const FORMULA: Candidate[] = [{ local: 'formula-powder', grams: 800 }];
const PET_FOOD: Candidate[] = [
  { local: 'pet-food-dry-2kg', grams: 2000 },
  { local: 'pet-food-dry-12kg', grams: 12000 },
  { local: 'pet-food-tins-12', grams: 4800 },
];

/**
 * Open Food Facts category tags to the pack types they usually mean. Small on purpose: a tag we
 * do not know gives no suggestion, and the person searches. Every local id is checked against the
 * bundled pack by a test.
 */
export const CATEGORY_TABLE: Readonly<Record<string, readonly Candidate[]>> = {
  'en:canned-foods': TINS,
  'en:canned-vegetables': TINS,
  'en:canned-meals': TINS,
  'en:baked-beans': TINS,
  'en:pastas': PASTA,
  'en:dry-pastas': PASTA,
  'en:rices': RICE,
  'en:waters': WATER,
  'en:spring-waters': WATER,
  'en:mineral-waters': WATER,
  'en:porridge-oats': OATS,
  'en:rolled-oats': OATS,
  'en:peanut-butters': PEANUT_BUTTER,
  'en:uht-milks': MILK,
  'en:infant-formulas': FORMULA,
  'en:dog-foods': PET_FOOD,
  'en:cat-foods': PET_FOOD,
};

const PACK = 'items-base';

/** How far apart two sizes are, as a ratio (1 is the same). */
const ratio = (a: number, b: number): number => (a > b ? a / b : b / a);

/**
 * At most three stock item types a scanned product is likely to be, best first: the types the
 * product's categories point at, ordered by how close their size is to the product's weight or
 * volume. Equipment entries (`assetTypeId`) are never offered. Pure: the caller passes the item
 * types it can see (the bundled packs plus the household's own).
 */
export function likelyTypes(product: ProductHints, types: readonly ItemType[]): ItemType[] {
  const byId = new Map(types.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const found: Array<{ type: ItemType; score: number; order: number }> = [];
  let order = 0;
  for (const tag of product.categories) {
    const candidates = CATEGORY_TABLE[tag];
    if (!candidates) continue;
    for (const c of candidates) {
      const id = `${PACK}:${c.local}`;
      const type = byId.get(id);
      order++;
      if (!type || type.assetTypeId !== undefined || seen.has(id)) continue;
      seen.add(id);
      const want = c.grams !== undefined ? product.grams : product.ml;
      const have = c.grams ?? c.ml;
      const score = want && have ? ratio(want, have) : Number.POSITIVE_INFINITY;
      found.push({ type, score, order });
    }
  }
  found.sort((a, b) => a.score - b.score || a.order - b.order);
  return found.slice(0, 3).map((f) => f.type);
}
