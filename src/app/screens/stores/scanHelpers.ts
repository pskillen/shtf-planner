import { useMemo } from 'react';
import type { AssetType, Item, OffFacts } from '../../../model';
import type { OffProduct, OffResult } from '../../../scan/openFoodFacts';
import { isValidGtin, normaliseGtin } from '../../../util';
import { useDocument } from '../../state';
import { usePacks } from '../../usePacks';

/** What Open Food Facts called it, as one line: "Heinz Baked Beanz 415 g". */
export function productLine(p: { name?: string; brand?: string; quantity?: string }): string {
  const base = p.name ?? p.brand ?? '';
  if (!base) return p.quantity ?? '';
  return p.quantity && !base.toLowerCase().includes(p.quantity.toLowerCase())
    ? `${base} ${p.quantity}`
    : base;
}

/**
 * The name for a new product made from what Open Food Facts said. The size lives in the product's
 * own `size`, so the quantity text is left off when it was parsed into one, and kept when it was
 * not, so nothing is lost.
 */
export function productName(p: {
  name?: string;
  brand?: string;
  quantity?: string;
  size?: unknown;
}): string {
  const base = p.name ?? p.brand ?? '';
  return p.size && base ? base : productLine(p);
}

/** A kcal figure for display: whole numbers; OFF's label values arrive with a long tail. */
export function roundKcal(n: number): number {
  return Math.round(n);
}

/** "4" for a name like "Tuna chunks 4 x 145 g": how many units one scan of the pack holds. */
export function multipackCount(name: string): number | undefined {
  const m = /\b(\d{1,3})\s*[x×]\s*\d/i.exec(name);
  const n = m ? Number(m[1]) : 0;
  return n >= 2 ? n : undefined;
}

/** What "how many" counts, in words: each unit (tin), not each pack; says so for a multipack. */
export function quantityHint(unit: string, name: string): string {
  const n = multipackCount(name);
  return n
    ? `Count each ${unit}, not each pack: one ${n}-pack is ${n} ${unit}s.`
    : `Count each ${unit}.`;
}

/** kcal line for a scan preview: the label when known, else the item's typical figure. */
export function previewKcalLine(
  item: Item | undefined,
  labelKcalPer100?: number,
): string | undefined {
  if (labelKcalPer100 !== undefined && item && item.measure !== 'count') {
    const per = item.measure === 'volume' ? 'ml' : 'g';
    return `${roundKcal(labelKcalPer100)} kcal per 100 ${per} (from the label)`;
  }
  const food = item?.gives.find((g) => g.resource === 'foodKcal');
  if (!food || !item || item.measure === 'count') return undefined;
  const per = item.measure === 'volume' ? 'ml' : 'g';
  return `about ${roundKcal(food.amount)} kcal per 100 ${per}`;
}

/** One line for what Open Food Facts found: name and size, then kcal when there is one. */
export function offPreviewText(off: OffProduct, suggestItem?: Item): string {
  const line = productLine(off) || 'a product with no name';
  const kcal = previewKcalLine(
    suggestItem,
    off.kcalPer100 !== undefined ? off.kcalPer100 : undefined,
  );
  return kcal ? `${line} · ${kcal}` : line;
}

/** Stock items the household can use: those of the enabled packs, never equipment, in pack order. */
export function useStockItems(): Item[] {
  const doc = useDocument();
  const packs = usePacks();
  return useMemo(() => {
    const enabled = new Set(packs.enabledPacks(doc.settings).map((p) => p.id));
    return Object.values(packs.items).filter(
      (t) => enabled.has(t.id.split(':')[0]!) && t.assetTypeId === undefined,
    );
  }, [packs, doc.settings]);
}

/** What to keep of a lookup on a queued scan: enough to make the product later. */
export function offFactsOf(result: OffResult | 'looking'): OffFacts | undefined {
  if (typeof result !== 'object') return undefined;
  return {
    found: result.found,
    ...(result.name ? { name: result.name } : {}),
    ...(result.brand ? { brand: result.brand } : {}),
    ...(result.quantity ? { quantity: result.quantity } : {}),
    ...(result.size ? { size: result.size } : {}),
    ...(result.kcalPer100 !== undefined ? { kcalPer100: result.kcalPer100 } : {}),
    categories: result.categories.slice(0, 20),
    checked: new Date().toISOString(),
  };
}

/** The number typed by hand, ready to use, or why not. */
export function readTypedCode(text: string): { code: string } | { problem: string } {
  const digits = text.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) return { problem: 'A barcode number is digits only.' };
  if (!isValidGtin(digits)) {
    return { problem: 'That number does not look right. Check the digits under the bars.' };
  }
  return { code: normaliseGtin(digits) };
}

/**
 * Equipment (a stove, a generator) that matches a search, by its own name or the name of a thing
 * people buy for it. Equipment is never stock: these route to the equipment form.
 */
export function useEquipmentMatches(query: string, active = true): AssetType[] {
  const packs = usePacks();
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!active || q === '') return [];
    const linked = (t: AssetType) =>
      Object.values(packs.items)
        .filter((i) => i.assetTypeId === t.id)
        .map((i) => i.name);
    return Object.values(packs.assets).filter((t) =>
      [t.name, ...linked(t)].some((n) => n.toLowerCase().includes(q)),
    );
  }, [active, query, packs]);
}

/** "Saved 1 × Test beans 415 g to Pantry". */
export const savedText = (qty: number, name: string, place: string): string =>
  `Saved ${qty} × ${name} to ${place}`;

/** The summary line for the Done screen. */
export function summaryText(items: number, ms: number, sortLater: number): string {
  const minutes = Math.max(ms / 60_000, 1 / 60);
  const mins = Math.max(1, Math.round(minutes));
  const rate = items / minutes;
  const parts = [
    `${items} ${items === 1 ? 'item' : 'items'} in ${mins} min (${rate.toFixed(1)} a minute)`,
  ];
  if (sortLater > 0) parts.push(`${sortLater} to sort later`);
  return parts.join(' · ');
}

/** How each date in a stocktake was set. Counts only: never the text read, a code or a picture. */
export interface DateCounts {
  camera: number;
  picked: number;
  suggestion: number;
}

export const median = (values: number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};

/** "dates by camera 9 · picked 4 · from a suggestion 1 · date step 3.2 s (median)", or nothing if none. */
export function dateSummaryText(counts: DateCounts, dateMs: number[]): string {
  if (counts.camera + counts.picked + counts.suggestion === 0) return '';
  const parts = [
    `dates by camera ${counts.camera}`,
    `picked ${counts.picked}`,
    `from a suggestion ${counts.suggestion}`,
  ];
  if (dateMs.length > 0) parts.push(`date step ${(median(dateMs) / 1000).toFixed(1)} s (median)`);
  return parts.join(' · ');
}
