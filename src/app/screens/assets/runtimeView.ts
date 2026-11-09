import type { CapabilityId, Document, Packs } from '../../../model';
import { usualProduct, type EquipmentRuntime, type FuelLot } from '../../../engine';
import { CAPABILITY_LABEL } from '../../labels';

/** One sentence about what the fuel gives one piece of equipment, for one capability. */
export interface RuntimeLine {
  key: string; // `${assetId}|${capability}`
  assetId: string;
  capability: CapabilityId;
  text: string;
  /** Set only for a 'no-fuel' line with a known item: what Quick add opens with. */
  quickAdd?: { itemId: string; productId?: string; label: string };
}

const ORDER: CapabilityId[] = ['cooking', 'heat', 'power'];
const STATUS_RANK: Record<EquipmentRuntime['status'], number> = {
  counted: 0,
  'no-fuel': 1,
  alternative: 2,
  unknown: 3,
  blocked: 4,
};

function floorTo(n: number, places: number): string {
  const f = 10 ** places;
  // The small nudge keeps 7.5 from floating down to 7.4 before the floor.
  return String(Math.floor(n * f + 1e-9) / f);
}

/**
 * Display rounding only: down to one decimal below 10 and to whole numbers from 10 up, so a line
 * never promises more than the engine counted.
 */
export function roundDown(n: number): string {
  return n < 10 ? floorTo(n, 1) : floorTo(n, 0);
}

const packs2 = (n: number): string => floorTo(n, 2);

function list(names: string[]): string {
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

type DocView = Pick<Document, 'assets' | 'products' | 'stock'>;
type PackView = Pick<Packs, 'items' | 'assets'>;

function lotsText(lots: readonly FuelLot[], doc: DocView, packs: PackView): string {
  const live = new Map<string, { held: number; counted: number; itemId: string }>();
  let expired = 0;
  for (const lot of lots) {
    if (lot.expired) {
      expired += lot.heldPacks;
      continue;
    }
    if (lot.heldPacks <= 0) continue;
    const cur = live.get(lot.productId) ?? { held: 0, counted: 0, itemId: lot.itemId };
    cur.held += lot.heldPacks;
    cur.counted += lot.countedPacks;
    live.set(lot.productId, cur);
  }
  const parts = [...live.entries()].map(([productId, l]) => {
    const name = doc.products[productId]?.name ?? packs.items[l.itemId]?.name ?? l.itemId;
    const base = `${packs2(l.held)} × ${name}`;
    return l.counted < l.held ? `${base} (${packs2(l.counted)} counted at the minimum)` : base;
  });
  const out = parts.length > 0 ? [`on ${parts.join(', ')}`] : [];
  if (expired > 0) out.push(`${packs2(expired)} out of date, not counted`);
  return out.join(' · ');
}

function lineFor(
  first: EquipmentRuntime,
  all: readonly EquipmentRuntime[],
  doc: DocView,
  packs: PackView,
): RuntimeLine {
  const cap = CAPABILITY_LABEL[first.capability];
  const make = (text: string, quickAdd?: RuntimeLine['quickAdd']): RuntimeLine => ({
    key: `${first.assetId}|${first.capability}`,
    assetId: first.assetId,
    capability: first.capability,
    text,
    ...(quickAdd ? { quickAdd } : {}),
  });
  const itemName = (id: string | undefined) => (id ? (packs.items[id]?.name ?? id) : 'fuel');
  const itemId = first.selectedItemIds[0];

  if (first.status === 'unknown' || first.status === 'blocked') {
    return make(`${cap}: not counted until its checks are done`);
  }
  if (first.status === 'no-fuel') {
    const productId = itemId ? usualProduct(doc, itemId)?.id : undefined;
    const stale = lotsText(first.inputLots, doc, packs)
      .split(' · ')
      .filter((t) => t.includes('out of date'));
    return make(
      [`${cap}: no ${itemName(itemId)} in stock`, ...stale].join(' · '),
      itemId
        ? { itemId, ...(productId ? { productId } : {}), label: `Quick add ${itemName(itemId)}` }
        : undefined,
    );
  }
  if (first.status === 'alternative') {
    const counted = all.find(
      (r) =>
        r.assetId !== first.assetId &&
        r.capability === first.capability &&
        r.selectedItemIds[0] === itemId &&
        (r.status === 'counted' || r.status === 'no-fuel'),
    );
    return make(
      `${cap}: could use the ${itemName(itemId)} instead of ${counted?.name ?? 'the equipment counted'}; not counted on top`,
    );
  }

  // Counted. Cooking claims shared fuel first, then heat, then power: read it off the sharers'
  // own capabilities, never by comparing numbers.
  const sharers = all.filter(
    (r) =>
      first.sharingAssetIds.includes(r.assetId) &&
      r.status !== 'blocked' &&
      r.status !== 'unknown' &&
      r.selectedItemIds[0] === itemId,
  );
  const mine = ORDER.indexOf(first.capability);
  const earlier = ORDER.find((c, i) => i < mine && sharers.some((r) => r.capability === c));
  const after = earlier ? `, after ${earlier}` : '';

  const avail = first.availableHours ?? 0;
  const allocated = first.allocatedHours ?? 0;
  const head =
    first.days !== undefined && allocated > 0
      ? `${roundDown(first.days) === '1' ? '1 day' : `${roundDown(first.days)} days`} at your plan's use${after} · ${roundDown(allocated)} of ${roundDown(avail)} hours available`
      : `${roundDown(avail)} hours available${after}`;
  const parts = [`${cap}: ${head}`];
  const lots = lotsText(first.inputLots, doc, packs);
  if (lots) parts.push(lots);
  if (first.sharingAssetIds.length > 0) {
    const names = first.sharingAssetIds.map((id) => {
      const a = doc.assets[id];
      return a?.name || (a ? packs.assets[a.typeId]?.name : undefined) || id;
    });
    parts.push(`shares the ${itemName(itemId)} with ${list(names)}`);
  }
  if (first.source === 'manual') parts.push('fuel use from your manual');
  return make(parts.join(' · '));
}

/**
 * The engine's per-converter runtime as plain sentences, by asset. It only picks, names and
 * rounds for display; every number comes from the engine.
 */
export function runtimeLines(
  runtime: readonly EquipmentRuntime[],
  doc: DocView,
  packs: PackView,
): Map<string, RuntimeLine[]> {
  const groups = new Map<string, EquipmentRuntime[]>();
  for (const r of runtime) {
    const key = `${r.assetId}|${r.capability}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out = new Map<string, RuntimeLine[]>();
  for (const entries of groups.values()) {
    // A contribution whose operating mode is not the chosen one is not this equipment's line.
    const live = entries.filter((e) => !e.reasons.includes('operating-mode'));
    const line: RuntimeLine =
      live.length > 0
        ? lineFor(
            [...live].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])[0]!,
            runtime,
            doc,
            packs,
          )
        : {
            key: `${entries[0]!.assetId}|${entries[0]!.capability}`,
            assetId: entries[0]!.assetId,
            capability: entries[0]!.capability,
            text: `${CAPABILITY_LABEL[entries[0]!.capability]}: not counted until its checks are done`,
          };
    out.set(line.assetId, [...(out.get(line.assetId) ?? []), line]);
  }
  for (const [id, lines] of out) {
    out.set(
      id,
      [...lines].sort((a, b) => ORDER.indexOf(a.capability) - ORDER.indexOf(b.capability)),
    );
  }
  return out;
}
