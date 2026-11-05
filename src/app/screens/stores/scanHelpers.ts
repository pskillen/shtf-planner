import { useMemo } from 'react';
import type { AssetType, ItemType, ProductInfo } from '../../../model';
import type { OffResult } from '../../../scan/openFoodFacts';
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

/** Stock item types the household can use: enabled packs and its own, never equipment. */
export function useStockTypes(): ItemType[] {
  const doc = useDocument();
  const packs = usePacks();
  return useMemo(() => {
    const enabled = new Set(['custom', ...packs.enabledPacks(doc.settings).map((p) => p.id)]);
    return Object.values(packs.items).filter(
      (t) => enabled.has(t.id.split(':')[0]!) && t.assetTypeId === undefined,
    );
  }, [packs, doc.settings]);
}

/** What to keep of a lookup on a queued scan. */
export function productInfoOf(result: OffResult | 'looking'): ProductInfo | undefined {
  if (typeof result !== 'object') return undefined;
  return {
    found: result.found,
    ...(result.name ? { name: result.name } : {}),
    ...(result.quantity ? { quantity: result.quantity } : {}),
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

/** "Saved 1 × Tinned food (400 g tin) to Pantry". */
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
