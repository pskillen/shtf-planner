import { useMemo } from 'react';
import type { ItemType, ProductInfo } from '../../../model';
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
