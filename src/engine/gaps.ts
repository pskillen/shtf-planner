import type { CapabilityId, Document, Packs } from '../model';
import { baseAmount as baseAmountOf, compareText, formatSize } from '../util';
import { CAPABILITY_ORDER, fitsHousehold } from './context';
import { usualPack } from './products';
import { analyse, capabilityTargetId, type Analysis, type Coverage } from './coverage';
import { closeHours, closeResource, type SuggestContext, type Suggestion } from './suggest';
import type { Target } from './targets';

export type { Suggestion } from './suggest';

export interface Gap {
  capability: CapabilityId;
  target: Target;
  coverage: Coverage | null;
  /** Target minus coverage, in `unit`; 0 for a task whose target is already met. */
  shortfall: number;
  unit: string;
  /** The cheapest sensible ways to close it, best first. */
  suggestions: Suggestion[];
  /**
   * `acquire`: buy or get more (a resource's shortfall less what restocking puts back, so the two
   * add up to the target's shortfall). `replenish`: a rotating location is below its minimum. `task`: an asset gives nothing until a question is put
   * right, or a driving range needs keeping up. `plan`: a plan item to do or redo.
   */
  kind: 'acquire' | 'replenish' | 'task' | 'plan';
  /** A critical medication. */
  critical?: boolean;
  /** For `replenish`: which minimum, so a screen can say "3 below its minimum of 6". */
  restock?: { place: string; itemName: string; minimum: number; actual: number };
}

const KIND_ORDER: Gap['kind'][] = ['acquire', 'replenish', 'task', 'plan'];
const EPS = 1e-9;

export function suggestContext(doc: Document, packs: Packs, a: Analysis): SuggestContext {
  return { doc, packs, people: a.people, cookingMet: a.cookingMet };
}

/** Gaps from an analysis (so `score` and others can share the work). */
export function gapsFrom(doc: Document, packs: Packs, a: Analysis): Gap[] {
  const ctx = suggestContext(doc, packs, a);
  const cov = new Map(a.coverage.map((c) => [c.targetId, c]));
  const tById = new Map(a.targets.map((t) => [t.id, t]));
  const out: Gap[] = [];

  // Stock below a rotating place's minimum counts only as far as it goes, so the missing part is in
  // the target's shortfall. A restock puts it back; the buy row is the shortfall beyond that.
  const restocking = new Map<string, number>();
  for (const b of a.belowMinimum) {
    const item = packs.items[b.itemId];
    const pack = item ? usualPack(doc, item) : undefined;
    const give = pack?.gives[0];
    const t = give
      ? a.targets.find((x) => x.kind === 'resource' && x.resource === give.resource)
      : undefined;
    if (!item || !give || !t) continue;
    if (!fitsHousehold(item, a.people)) continue;
    if (item.tags.includes('needs-cooking') && !a.cookingMet) continue;
    restocking.set(t.id, (restocking.get(t.id) ?? 0) + (b.minimum - b.actual) * give.amount);
  }

  for (const t of a.targets) {
    const c = cov.get(t.id) ?? null;
    const shortfall = Math.max(0, t.amount - (c?.amount ?? 0));
    if (shortfall <= EPS) continue;
    const base = { capability: t.capability, target: t, coverage: c, shortfall, unit: t.unit };
    switch (t.kind) {
      case 'plan': {
        const def = packs.plans[t.planItemId!]!;
        const redo = doc.plans[t.planItemId!]?.doneAt !== undefined;
        out.push({
          ...base,
          kind: 'plan',
          suggestions: [{ planItemId: def.id, label: redo ? `Redo: ${def.text}` : def.text }],
        });
        break;
      }
      case 'medication':
        out.push({
          ...base,
          kind: 'acquire',
          ...(t.critical ? { critical: true } : {}),
          suggestions: [
            {
              label: `Get ${Math.ceil(shortfall)} more doses of ${t.label}, a repeat prescription if you can`,
            },
          ],
        });
        break;
      case 'hours':
        out.push({
          ...base,
          kind: 'acquire',
          suggestions: closeHours(ctx, doc, t.capability, shortfall),
        });
        break;
      case 'range':
        out.push({
          ...base,
          kind: 'task',
          suggestions: [
            { label: `Keep a vehicle charged or fuelled to drive ${Math.ceil(t.amount)} km` },
          ],
        });
        break;
      case 'device': {
        const radios = Object.values(packs.items)
          .filter((i) => i.tags.includes('radio-rx') && i.typicalPricePence !== undefined)
          .sort((x, y) => x.typicalPricePence! - y.typicalPricePence!);
        out.push({
          ...base,
          kind: 'acquire',
          suggestions: radios.slice(0, 3).map((r) => ({
            itemId: r.id,
            qty: 1,
            label: `1 × ${r.name}`,
            pricePence: r.typicalPricePence!,
          })),
        });
        break;
      }
      case 'resource': {
        const buy = shortfall - (restocking.get(t.id) ?? 0);
        if (buy <= EPS) break;
        out.push({
          ...base,
          shortfall: buy,
          kind: 'acquire',
          suggestions:
            t.id === 'power:batteryWh'
              ? [
                  ...closeHours(ctx, doc, 'power', buy),
                  ...closeResource(ctx, t.resource as string, buy).map((s) => ({
                    ...s,
                    capabilities: ['power' as const],
                  })),
                ]
              : closeResource(ctx, t.resource as string, buy),
        });
        break;
      }
    }
  }

  // Rotating locations below their minimum: restock the item there.
  for (const b of a.belowMinimum) {
    const item = packs.items[b.itemId];
    const pack = item ? usualPack(doc, item) : undefined;
    const give = pack?.gives[0];
    const t = give
      ? a.targets.find((x) => x.kind === 'resource' && x.resource === give.resource)
      : undefined;
    if (!item || !pack || !give || !t) continue;
    const shortfallQty = b.minimum - b.actual;
    const qty = Math.ceil(shortfallQty - 1e-9);
    const where = doc.locations[b.locationId]?.name ?? b.locationId;
    const name = pack.product?.name ?? `${item.name} ${formatSize(pack.size)}`;
    const first = item.sizes[0];
    out.push({
      capability: t.capability,
      target: t,
      coverage: cov.get(t.id) ?? null,
      shortfall: shortfallQty * give.amount,
      unit: t.unit,
      kind: 'replenish',
      restock: { place: where, itemName: item.name, minimum: b.minimum, actual: b.actual },
      suggestions: [
        {
          itemId: item.id,
          ...(pack.product ? { productId: pack.product.id } : {}),
          qty,
          size: pack.size,
          label: `${qty} × ${name} back into the ${where}`,
          ...(item.typicalPricePence !== undefined && first
            ? {
                pricePence: Math.round(
                  (qty * item.typicalPricePence * baseAmountOf(pack.size)) / baseAmountOf(first),
                ),
              }
            : {}),
          perUnitCoverage: give.amount,
        },
      ],
    });
  }

  // Assets that give nothing until a question is put right.
  for (const c of a.coverage) {
    for (const b of c.blockedAssets ?? []) {
      const t = tById.get(c.targetId);
      if (!t) continue;
      out.push({
        capability: t.capability,
        target: t,
        coverage: c,
        shortfall: Math.max(0, t.amount - c.amount),
        unit: t.unit,
        kind: 'task',
        suggestions: [{ assetId: b.assetId, question: b.question, label: b.task }],
      });
    }
  }

  // Add independent primary demands for the same fuel once, retaining alternatives per need.
  const separateItems = new Set(
    out.filter((g) => g.suggestions.length > 1).map((g) => g.suggestions[0]?.itemId),
  );
  const shared = new Map<string, Gap>();
  const merged = new Set<Gap>();
  for (const gap of out) {
    const s = gap.suggestions[0];
    if (
      gap.kind !== 'acquire' ||
      (gap.target.kind !== 'hours' && gap.target.id !== 'power:batteryWh') ||
      !s?.itemId ||
      separateItems.has(s.itemId) ||
      s.fuelDemand === undefined ||
      !s.perUnitCoverage
    )
      continue;
    const previous = shared.get(s.itemId);
    if (!previous) {
      shared.set(s.itemId, gap);
      continue;
    }
    // A per-need alternative cannot replace another need's fuel. Keep these
    // requirements separate whenever either has an alternative.
    if (previous.suggestions.length > 1 || gap.suggestions.length > 1) {
      shared.delete(s.itemId);
      continue;
    }
    const primary = previous.suggestions[0]!;
    if (primary.productId !== s.productId || primary.perUnitCoverage !== s.perUnitCoverage)
      continue;
    if ((primary.capabilities?.length ?? 1) === 1) {
      previous.suggestions = [
        primary,
        ...previous.suggestions
          .slice(1)
          .map((alt) => ({ ...alt, label: `For ${previous.capability} instead: ${alt.label}` })),
      ];
    }
    previous.suggestions.push(
      ...gap.suggestions
        .slice(1)
        .map((alt) => ({ ...alt, label: `For ${gap.capability} instead: ${alt.label}` })),
    );
    const demand = primary.fuelDemand! + s.fuelDemand;
    const qty = Math.ceil(demand / s.perUnitCoverage - EPS);
    const item = packs.items[s.itemId]!;
    const name = primary.productId
      ? (doc.products[primary.productId]?.name ?? item.name)
      : `${item.name} ${formatSize(primary.size!)}`;
    primary.fuelDemand = demand;
    if (primary.size) primary.amount = (demand / s.perUnitCoverage) * baseAmountOf(primary.size);
    primary.qty = qty;
    primary.label = `${qty} × ${name} for your equipment`;
    primary.detail = undefined;
    primary.assetIds = [...new Set([...(primary.assetIds ?? []), ...(s.assetIds ?? [])])].sort();
    primary.capabilities = [
      ...new Set([
        ...(primary.capabilities ?? [previous.capability]),
        ...(s.capabilities ?? [gap.capability]),
      ]),
    ];
    if (primary.pricePence !== undefined && s.pricePence !== undefined && s.qty)
      primary.pricePence = Math.round((s.pricePence / s.qty) * qty);
    merged.add(gap);
  }
  for (let i = out.length - 1; i >= 0; i--) if (merged.has(out[i]!)) out.splice(i, 1);

  const cap = (g: Gap) => CAPABILITY_ORDER.indexOf(g.capability);
  return out.sort(
    (x, y) =>
      cap(x) - cap(y) ||
      KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind) ||
      compareText(x.target.id, y.target.id),
  );
}

/**
 * What is missing against each target, with the cheapest sensible way to close it: whole units of
 * the cheapest item that gives the resource; a heater and its fuel when there is no heater;
 * `replenish` for a rotating location below its minimum; `task` for an asset that gives nothing
 * until a question is put right (solar without an EPS); `plan` for a plan item not done or expired.
 */
export function gaps(
  doc: Document,
  packs: Packs,
  asOf: string,
  horizonDays: number = doc.settings.horizonDays,
): Gap[] {
  return gapsFrom(doc, packs, analyse(doc, packs, asOf, horizonDays));
}

export { capabilityTargetId };
