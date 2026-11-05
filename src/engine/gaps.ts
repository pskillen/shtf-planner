import type { CapabilityId, Document, Packs } from '../model';
import { compareText } from '../util';
import { CAPABILITY_ORDER, fitsHousehold } from './context';
import { analyse, capabilityTargetId, type Analysis, type Coverage } from './coverage';
import { closeHours, closeStore, type SuggestContext, type Suggestion } from './suggest';
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
   * `acquire`: buy or get more (a store's shortfall less what restocking puts back, so the two
   * add up to the target's shortfall). `replenish`: a rotating location is below its floor. `task`: an asset gives nothing until a question is put
   * right, or a driving range needs keeping up. `plan`: a plan item to do or redo.
   */
  kind: 'acquire' | 'replenish' | 'task' | 'plan';
  /** A critical medication. */
  critical?: boolean;
  /** For `replenish`: which floor, so a screen can say "3 below its minimum of 6". */
  restock?: { place: string; typeName: string; floor: number; actual: number };
}

const KIND_ORDER: Gap['kind'][] = ['acquire', 'replenish', 'task', 'plan'];
const EPS = 1e-9;

export function suggestContext(packs: Packs, a: Analysis): SuggestContext {
  return { packs, people: a.people, cookingMet: a.cookingMet };
}

/** Gaps from an analysis (so `score` and others can share the work). */
export function gapsFrom(doc: Document, packs: Packs, a: Analysis): Gap[] {
  const ctx = suggestContext(packs, a);
  const cov = new Map(a.coverage.map((c) => [c.targetId, c]));
  const tById = new Map(a.targets.map((t) => [t.id, t]));
  const out: Gap[] = [];

  // Stock below a rotating place's floor counts only as far as it goes, so the missing part is in
  // the target's shortfall. A restock puts it back; the buy row is the shortfall beyond that.
  const restocking = new Map<string, number>();
  for (const b of a.belowFloor) {
    const type = packs.items[b.typeId];
    const give = type?.gives[0];
    const t = give
      ? a.targets.find((x) => x.kind === 'store' && x.store === give.store)
      : undefined;
    if (!type || !give || !t) continue;
    if (!fitsHousehold(type, a.people)) continue;
    if (type.tags.includes('needs-cooking') && !a.cookingMet) continue;
    restocking.set(t.id, (restocking.get(t.id) ?? 0) + (b.floor - b.actual) * give.amount);
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
            itemTypeId: r.id,
            qty: 1,
            label: `1 × ${r.name}`,
            pricePence: r.typicalPricePence!,
          })),
        });
        break;
      }
      case 'store': {
        const buy = shortfall - (restocking.get(t.id) ?? 0);
        if (buy <= EPS) break;
        out.push({
          ...base,
          shortfall: buy,
          kind: 'acquire',
          suggestions: closeStore(ctx, t.store as string, buy),
        });
        break;
      }
    }
  }

  // Rotating locations below their floor: restock the type there.
  for (const b of a.belowFloor) {
    const type = packs.items[b.typeId];
    const give = type?.gives[0];
    const t = give
      ? a.targets.find((x) => x.kind === 'store' && x.store === give.store)
      : undefined;
    if (!type || !give || !t) continue;
    const qty = b.floor - b.actual;
    const where = doc.locations[b.locationId]?.name ?? b.locationId;
    out.push({
      capability: t.capability,
      target: t,
      coverage: cov.get(t.id) ?? null,
      shortfall: qty * give.amount,
      unit: t.unit,
      kind: 'replenish',
      restock: { place: where, typeName: type.name, floor: b.floor, actual: b.actual },
      suggestions: [
        {
          itemTypeId: type.id,
          qty,
          label: `${qty} × ${type.name} back into ${where}`,
          ...(type.typicalPricePence !== undefined
            ? { pricePence: qty * type.typicalPricePence }
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
        suggestions: [{ assetTypeId: b.assetTypeId, label: b.task }],
      });
    }
  }

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
 * the cheapest item that gives the store; a heater and its fuel when there is no heater;
 * `replenish` for a rotating location below its floor; `task` for an asset that gives nothing
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
