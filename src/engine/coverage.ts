import type {
  Asset,
  AssetType,
  CapabilityId,
  Contribution,
  Document,
  ItemInstance,
  ItemType,
  Packs,
  ResourceId,
} from '../model';
import { ASSUMPTIONS } from './assumptions';
import { fitsHousehold, fmt, localId, peopleAt, type Person } from './context';
import { monthOf } from './dates';
import { targets as computeTargets, planDone, type Target } from './targets';

export interface CoverageSource {
  kind: 'item' | 'asset' | 'floor' | 'medication' | 'plan';
  id: string;
  /** In the target's unit; 0 for something listed but not counted (expired, gated, unfit). */
  amount: number;
  expired?: boolean;
  /** Why it counts for less than it holds. */
  note?: string;
}

/** An asset that gives nothing, and what would fix it. */
export interface BlockedAsset {
  assetId: string;
  assetTypeId: string;
  name: string;
  capability: CapabilityId;
  question: string;
  /** Why it gives nothing. */
  reason: string;
  /** What to do about it. */
  task: string;
}

export interface Coverage {
  /** The `Target.id` this is the coverage of. */
  targetId: string;
  capability: CapabilityId;
  resource?: Target['resource'];
  /** In the target's unit. */
  amount: number;
  unit: string;
  /** How many days of the target's daily rate this covers; absent for one-offs, ranges, devices and plans. */
  days?: number;
  from: CoverageSource[];
  /** Why an asset gives nothing, e.g. "Roof solar gives nothing in an outage: ...". */
  blocked?: string;
  blockedAssets?: BlockedAsset[];
}

/** A rotating location holding fewer of a type than its floor. */
export interface BelowFloor {
  locationId: string;
  typeId: string;
  floor: number;
  actual: number;
}

export interface Analysis {
  targets: Target[];
  coverage: Coverage[];
  belowFloor: BelowFloor[];
  /** Cooking hours meet their target (or there is no cooking target): food that needs cooking counts. */
  cookingMet: boolean;
  /** Something to make raw water safe: tablets, bleach, a filter, or cooking to boil it. */
  treatmentAvailable: boolean;
  people: Person[];
}

type Src = CoverageSource & { gate?: 'cooking' | 'treatment' };

/** The target an asset's contribution to `capability` counts towards. */
export function capabilityTargetId(capability: CapabilityId): string | undefined {
  switch (capability) {
    case 'power':
      return 'power:batteryWh';
    case 'heat':
    case 'cooking':
      return `${capability}:hours`;
    case 'comms':
      return 'comms:radio';
    case 'water':
      return 'water:waterL';
    default:
      return undefined;
  }
}

const DEVICE = 'device:radio';
const NUMBER = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const whenOk = (c: Contribution, a: Asset): boolean =>
  !c.when || a.answers[c.when.question] === c.when.equals;

/** A converter an asset provides: burns `resource` at `perHour` and gives `output` capability units an hour. */
export interface Converter {
  asset: Asset;
  name: string;
  capability: CapabilityId;
  resource: ResourceId;
  perHour: number;
  /** Capability units per running hour: 1 for heat or cooking (an hour), watts for power. */
  output: number;
}

export function activeConverters(doc: Document, packs: Packs): Converter[] {
  const out: Converter[] = [];
  for (const asset of Object.values(doc.assets)) {
    const type = packs.assets[asset.typeId];
    if (!type) continue;
    for (const c of type.contributes) {
      if (!c.converts || !whenOk(c, asset)) continue;
      const perHour =
        c.converts.perHour ??
        (c.converts.perHourFrom ? NUMBER(asset.answers[c.converts.perHourFrom]) : undefined);
      if (!(perHour && perHour > 0)) continue;
      const output =
        c.outputPerHour === undefined
          ? 1
          : typeof c.outputPerHour === 'number'
            ? c.outputPerHour
            : NUMBER(asset.answers[c.outputPerHour.fromQuestion]);
      if (!(output && output > 0)) continue;
      out.push({
        asset,
        name: asset.name ?? type.name,
        capability: c.capability,
        resource: c.converts.resource,
        perHour,
        output,
      });
    }
  }
  return out;
}

/** Assets that have a conditional contribution to a capability and none of them applies. */
function blockedAssets(doc: Document, packs: Packs): BlockedAsset[] {
  const out: BlockedAsset[] = [];
  for (const asset of Object.values(doc.assets)) {
    const type = packs.assets[asset.typeId];
    if (!type) continue;
    const name = asset.name ?? type.name;
    const byCap = new Map<CapabilityId, Contribution[]>();
    for (const c of type.contributes)
      byCap.set(c.capability, [...(byCap.get(c.capability) ?? []), c]);
    for (const [capability, list] of byCap) {
      if (!list.every((c) => c.when) || list.some((c) => whenOk(c, asset))) continue;
      const when = list[0]!.when!;
      const q = type.questions.find((x) => x.id === when.question);
      const answered = asset.answers[when.question];
      const text = q?.text ?? when.question;
      const reason =
        answered === undefined
          ? `${name} gives nothing until you answer: ${text}`
          : `${name} gives nothing in an outage: ${text} (answered ${String(answered)})`;
      out.push({
        assetId: asset.id,
        assetTypeId: asset.typeId,
        name,
        capability,
        question: when.question,
        reason,
        task: blockedTask(name, when.question, q?.kind, text),
      });
    }
  }
  return out;
}

function blockedTask(
  name: string,
  question: string,
  kind: string | undefined,
  text: string,
): string {
  if (question === 'hasEps') return `Fit an EPS so ${name} keeps working in a power cut`;
  if (question === 'v2l') return `Check whether ${name} can power a socket (vehicle-to-load)`;
  return kind === 'bool' ? `Sort out ${name}: ${text}` : `Answer for ${name}: ${text}`;
}

function sum(list: readonly CoverageSource[] | undefined): number {
  return (list ?? []).reduce((n, s) => n + s.amount, 0);
}

/**
 * Computes the targets and what the household has against each of them. See `coverage` for the
 * rules; the extra outputs (`belowFloor`, `cookingMet`, ...) feed `gaps`.
 */
export function analyse(
  doc: Document,
  packs: Packs,
  asOf: string,
  horizonDays: number = doc.settings.horizonDays,
): Analysis {
  const days = horizonDays;
  const ts = computeTargets(doc, packs, asOf, days);
  const tById = new Map(ts.map((t) => [t.id, t]));
  const people = peopleAt(doc, asOf);
  const month = monthOf(asOf);

  // ---- 1. Stores from items -------------------------------------------------------------
  const pools = new Map<string, Src[]>();
  const push = (resource: string, s: Src) =>
    pools.set(resource, [...(pools.get(resource) ?? []), s]);
  const belowFloor: BelowFloor[] = [];
  let hasTreatmentItem = false;

  const groups = new Map<string, ItemInstance[]>();
  for (const inst of Object.values(doc.items)) {
    if (!packs.items[inst.typeId]) continue;
    const key = `${inst.locationId}|${inst.typeId}`;
    groups.set(key, [...(groups.get(key) ?? []), inst]);
  }
  // A floor on a type with no instance at all is a shortfall of the whole floor.
  for (const key of Object.keys(doc.floors)) if (!groups.has(key)) groups.set(key, []);

  const givesOf = (type: ItemType): { resource: string; amount: number }[] => [
    ...type.gives,
    ...(type.tags.includes('radio-rx') ? [{ resource: DEVICE, amount: 1 }] : []),
  ];

  for (const [key, insts] of groups) {
    const [locationId, typeId] = key.split('|') as [string, string];
    const type = packs.items[typeId];
    if (!type) continue;
    const location = doc.locations[locationId];
    const gives = givesOf(type);
    const live = insts.filter((i) => !(i.bestBefore && i.bestBefore < month));
    const expired = insts.filter((i) => i.bestBefore && i.bestBefore < month);
    for (const e of expired)
      for (const g of gives)
        push(g.resource, {
          kind: 'item',
          id: e.id,
          amount: 0,
          expired: true,
          note: `best before ${e.bestBefore} has passed`,
        });

    const liveQty = live.reduce((n, i) => n + i.qty, 0);
    const fit = fitsHousehold(type, people);
    const gate = type.tags.includes('needs-cooking') ? ('cooking' as const) : undefined;
    const treatment = type.tags.includes('treatment') || localId(type.id) === 'water-filter';
    // Equipment is counted once, from the Equipment list: a stock row of an equipment type (from
    // a document made before the packs split the two) gives nothing, and says why.
    const countsAsStock = fit && type.assetTypeId === undefined;
    const unfit = fit
      ? type.assetTypeId === undefined
        ? undefined
        : `${type.name} is equipment: add it under Home, Equipment so it counts once`
      : "does not fit anyone's age in the household";

    if (location?.kind === 'rotating') {
      const floor = doc.floors[key];
      if (floor !== undefined && liveQty < floor)
        belowFloor.push({ locationId, typeId, floor, actual: liveQty });
      if (insts.length === 0 || (floor === undefined && liveQty === 0)) continue;
      const counted = floor === undefined ? 0 : Math.min(liveQty, floor);
      if (counted > 0 && countsAsStock && treatment) hasTreatmentItem = true;
      for (const g of gives) {
        push(g.resource, {
          kind: 'floor',
          id: key,
          amount: countsAsStock ? counted * g.amount : 0,
          ...(gate ? { gate } : {}),
          ...(unfit
            ? { note: unfit }
            : floor === undefined
              ? { note: `rotating location with no minimum: ${fmt(liveQty)} held, none relied on` }
              : counted < liveQty
                ? { note: `counted at the minimum of ${fmt(floor)}, ${fmt(liveQty)} held` }
                : {}),
        });
      }
    } else {
      for (const inst of live) {
        if (inst.qty > 0 && countsAsStock && treatment) hasTreatmentItem = true;
        for (const g of gives)
          push(g.resource, {
            kind: 'item',
            id: inst.id,
            amount: countsAsStock ? inst.qty * g.amount : 0,
            ...(gate ? { gate } : {}),
            ...(unfit ? { note: unfit } : {}),
          });
      }
    }
  }

  // ---- 2. Assets ------------------------------------------------------------------------
  const extras = new Map<string, Src[]>();
  const extra = (targetId: string | undefined, s: Src) => {
    if (targetId) extras.set(targetId, [...(extras.get(targetId) ?? []), s]);
  };
  let evRangeKm = 0;
  for (const asset of Object.values(doc.assets)) {
    const type: AssetType | undefined = packs.assets[asset.typeId];
    if (!type) continue;
    if (localId(type.id) === 'ev') {
      const kwh = NUMBER(asset.answers.kwh) ?? 0;
      evRangeKm = Math.max(
        evRangeKm,
        kwh * ASSUMPTIONS.evKmPerKwh.value * ASSUMPTIONS.evChargeFraction.value,
      );
    }
    for (const c of type.contributes) {
      if (!whenOk(c, asset)) continue;
      const target = capabilityTargetId(c.capability);
      if (c.storesWh) {
        const n = NUMBER(asset.answers[c.storesWh.fromQuestion]);
        if (n) {
          const wh = n * c.storesWh.perUnitWh * c.storesWh.usableFraction;
          extra(target, {
            kind: 'asset',
            id: asset.id,
            amount: wh,
            note: `${fmt(n)} x ${fmt(c.storesWh.usableFraction * 100)}% usable`,
          });
        }
      }
      const perDay =
        c.providesPerDay ??
        (c.providesPerDayFrom
          ? (NUMBER(asset.answers[c.providesPerDayFrom.question]) ?? 0) *
            c.providesPerDayFrom.factor
          : undefined);
      if (perDay && perDay > 0)
        extra(target, {
          kind: 'asset',
          id: asset.id,
          amount: perDay * days,
          note: `${fmt(perDay)} a day for ${days} days`,
        });
      if (c.holds) {
        const n = NUMBER(asset.answers[c.holds.fromQuestion]);
        if (n)
          push(c.holds.resource, {
            kind: 'asset',
            id: asset.id,
            amount: n * (c.holds.factor ?? 1),
            gate: 'treatment',
          });
      }
      if (
        c.capability === 'comms' &&
        !c.converts &&
        !c.storesWh &&
        !c.holds &&
        c.providesPerDay === undefined &&
        c.providesPerDayFrom === undefined
      )
        extra(target, { kind: 'asset', id: asset.id, amount: 1 });
    }
  }

  // ---- 3. Converters burn resources; a resource goes to the capability that needs it first ----------
  const fuelLeft = new Map<string, number>();
  const fuelStores = new Set<string>();
  const converters = activeConverters(doc, packs);
  for (const c of converters) fuelStores.add(c.resource);
  for (const resource of fuelStores) fuelLeft.set(resource, sum(pools.get(resource)));
  const caps: CapabilityId[] = ['cooking', 'heat', 'power'];
  for (const c of converters) if (!caps.includes(c.capability)) caps.push(c.capability);
  for (const capability of caps) {
    const targetId = capabilityTargetId(capability);
    let need = (targetId ? tById.get(targetId)?.amount : undefined) ?? 0;
    const here = converters.filter((c) => c.capability === capability);
    const resources = [...new Set(here.map((c) => c.resource))].sort();
    for (const resource of resources) {
      const best = here
        .filter((c) => c.resource === resource)
        .reduce((a, b) => (b.output / b.perHour > a.output / a.perHour ? b : a));
      const left = fuelLeft.get(resource) ?? 0;
      const amount = (left / best.perHour) * best.output;
      if (amount <= 0) continue;
      extra(targetId, {
        kind: 'asset',
        id: best.asset.id,
        amount,
        note: `${fmt(left)} ${resource} at ${fmt(best.perHour)} an hour`,
      });
      const claim = Math.min(amount, need);
      need -= claim;
      fuelLeft.set(resource, left - (claim / best.output) * best.perHour);
    }
  }

  const cookingTarget = tById.get('cooking:hours');
  const cookingMet = cookingTarget
    ? sum(extras.get('cooking:hours')) >= cookingTarget.amount - 1e-9
    : true;
  const treatmentAvailable = hasTreatmentItem || cookingMet;

  // ---- 4. Gates: food that needs cooking, raw water that needs treating -----------------------
  const resolved = (resource: string): CoverageSource[] =>
    (pools.get(resource) ?? []).map(({ gate, ...s }) => {
      if (gate === 'cooking' && !cookingMet && s.amount > 0)
        return { ...s, amount: 0, note: 'needs cooking and cooking is not covered' };
      if (gate === 'treatment' && !treatmentAvailable && s.amount > 0)
        return {
          ...s,
          amount: 0,
          note: 'untreated: needs a filter, tablets, bleach or fuel to boil it',
        };
      return s;
    });

  // ---- 5. One coverage row per target ------------------------------------------------------
  const blocked = blockedAssets(doc, packs);
  const petrolKm =
    (fuelLeft.get('petrolL') ?? sum(pools.get('petrolL'))) * ASSUMPTIONS.petrolKmPerL.value;
  const members = new Map(
    doc.household.members.flatMap((m) => m.medication.map((x) => [x.id, x] as const)),
  );

  const coverage = ts.map((t): Coverage => {
    let from: CoverageSource[] = [];
    switch (t.kind) {
      case 'resource': {
        from = [...resolved(t.resource as string), ...(extras.get(t.id) ?? [])];
        if (t.id === 'water:waterL') from.push(...resolved('waterRaw'));
        break;
      }
      case 'hours':
      case 'device':
        from = [...(extras.get(t.id) ?? [])];
        if (t.kind === 'device') from.push(...resolved(DEVICE));
        break;
      case 'range': {
        const best = Math.max(evRangeKm, petrolKm);
        if (best > 0)
          from = [
            evRangeKm >= petrolKm
              ? {
                  kind: 'asset',
                  id: 'ev',
                  amount: best,
                  note: `best single electric car, ${fmt(ASSUMPTIONS.evKmPerKwh.value)} km a kWh at half charge`,
                }
              : {
                  kind: 'item',
                  id: 'petrolL',
                  amount: best,
                  note: `petrol at ${fmt(ASSUMPTIONS.petrolKmPerL.value)} km a litre`,
                },
          ];
        break;
      }
      case 'medication': {
        const med = members.get(t.medicationId!);
        from = [{ kind: 'medication', id: t.medicationId!, amount: med?.unitsOnHand ?? 0 }];
        break;
      }
      case 'plan':
        from = [
          {
            kind: 'plan',
            id: t.planItemId!,
            amount: planDone(doc, packs, t.planItemId!, asOf) ? 1 : 0,
          },
        ];
        break;
    }
    const amount = sum(from);
    const mine = blocked.filter((b) => capabilityTargetId(b.capability) === t.id);
    const row: Coverage = {
      targetId: t.id,
      capability: t.capability,
      ...(t.resource ? { resource: t.resource } : {}),
      amount,
      unit: t.unit,
      from,
    };
    if (
      (t.kind === 'resource' || t.kind === 'hours' || t.kind === 'medication') &&
      !t.fixed &&
      t.amount > 0 &&
      t.days > 0
    )
      row.days = amount / (t.amount / t.days);
    if (mine.length > 0) {
      row.blocked = mine.map((b) => b.reason).join('; ');
      row.blockedAssets = mine;
    }
    return row;
  });

  return { targets: ts, coverage, belowFloor, cookingMet, treatmentAvailable, people };
}

/**
 * What the household has against each target, one row per target, in the target's unit.
 *
 * - Stores come from items (`gives` x quantity). An item past its best-before month counts zero
 *   and is listed as expired. In a `rotating` location a type counts at most its floor, and not
 *   at all without one; a `stored` location counts what is there. A baby item counts only while
 *   someone in the household fits its age band.
 * - Assets convert: a heater or stove turns a fuel resource into running hours, a generator into
 *   Wh, a battery or an EV holds Wh, an array provides Wh a day. A contribution whose `when`
 *   does not hold gives nothing and is reported in `blocked`. A fuel is shared: cooking takes what
 *   it needs first, then heat, then power, and the rest is left for the next.
 * - Food that needs cooking counts only when cooking is covered; raw water only when there is a
 *   way to treat it.
 */
export function coverage(
  doc: Document,
  packs: Packs,
  asOf: string,
  horizonDays: number = doc.settings.horizonDays,
): Coverage[] {
  return analyse(doc, packs, asOf, horizonDays).coverage;
}
