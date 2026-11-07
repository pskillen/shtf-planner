import type {
  Asset,
  AssetType,
  CapabilityId,
  Contribution,
  Document,
  Item,
  Packs,
  ResourceId,
  Stock,
} from '../model';
import { minimumKey } from '../model';
import { equipmentEligibility, type EquipmentReason } from './equipmentEligibility';
import { ASSUMPTIONS } from './assumptions';
import { fitsHousehold, fmt, localId, peopleAt, type Person } from './context';
import { monthOf } from './dates';
import { itemOfStock, packGives } from './products';
import { targets as computeTargets, planDone, type Target } from './targets';

export interface CoverageSource {
  kind: 'stock' | 'asset' | 'minimum' | 'medication' | 'plan';
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
  reasons?: EquipmentReason[];
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

/** A rotating location holding fewer packs of an item than its minimum. */
export interface BelowMinimum {
  locationId: string;
  itemId: string;
  minimum: number;
  actual: number;
}

export interface Analysis {
  targets: Target[];
  coverage: Coverage[];
  belowMinimum: BelowMinimum[];
  /** Cooking hours meet their target (or there is no cooking target): food that needs cooking counts. */
  cookingMet: boolean;
  /** Something to make raw water safe: tablets, bleach, a filter, or cooking to boil it. */
  treatmentAvailable: boolean;
  people: Person[];
  equipmentRuntime: EquipmentRuntime[];
}

export interface FuelLot {
  stockId: string;
  productId: string;
  itemId: string;
  locationId: string;
  heldPacks: number;
  countedPacks: number;
  resourceAmount: number;
  allocatedResource: number;
  expired?: boolean;
}
export interface EquipmentRuntime {
  assetId: string;
  assetTypeId: string;
  contributionKey: string;
  name: string;
  capability: CapabilityId;
  status: 'counted' | 'alternative' | 'unknown' | 'blocked' | 'no-fuel';
  reasons: EquipmentReason[];
  selectedItemIds: string[];
  rate?: number;
  output?: number;
  source?: string;
  note?: string;
  availableHours?: number;
  allocatedHours?: number;
  days?: number;
  sharingAssetIds: string[];
  inputLots: FuelLot[];
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
  itemId: string;
  contributionKey: string;
}

export function activeConverters(doc: Document, packs: Packs): Converter[] {
  const out: Converter[] = [];
  for (const asset of Object.values(doc.assets)) {
    const type = packs.assets[asset.typeId];
    if (!type) continue;
    for (const [index, c] of type.contributes.entries()) {
      if (!c.converts || !whenOk(c, asset)) continue;
      const eligible = equipmentEligibility(type, c, asset.answers);
      if (eligible.reasons.length || !eligible.itemId || !eligible.perHour || !eligible.output)
        continue;
      out.push({
        asset,
        name: asset.name ?? type.name,
        capability: c.capability,
        resource: c.converts.resource,
        perHour: eligible.perHour,
        output: eligible.output,
        itemId: eligible.itemId,
        contributionKey: `${type.id}:${index}`,
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
      for (const c of list.filter((x) => x.converts && whenOk(x, asset))) {
        const reasons = equipmentEligibility(type, c, asset.answers).reasons;
        if (!reasons.length) continue;
        const labels: Record<EquipmentReason, string> = {
          'operating-mode': 'choose the operating mode',
          'fuel-selection': 'choose the exact fuel',
          'fuel-confirmation': 'check the fuel and connection in the manual',
          'indoor-use': 'check that the manual permits indoor use',
          'high-rise': 'check the high-rise cylinder restriction',
          rate: 'enter a positive fuel use rate',
          output: 'enter a positive output',
        };
        for (const reasonCode of reasons)
          out.push({
            assetId: asset.id,
            assetTypeId: asset.typeId,
            name,
            capability,
            question: reasonCode,
            reason: `${name}: ${labels[reasonCode]}`,
            task: `${name}: ${labels[reasonCode]}`,
            reasons: [reasonCode],
          });
      }
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
 * rules; the extra outputs (`belowMinimum`, `cookingMet`, ...) feed `gaps`.
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
  const belowMinimum: BelowMinimum[] = [];
  const fuelLots: (FuelLot & { resource: string; remaining: number })[] = [];
  let hasTreatmentItem = false;

  /** Stock that counts as an item (through its product), grouped by place and item. */
  const groups = new Map<string, { locationId: string; item: Item; rows: Stock[] }>();
  for (const stock of Object.values(doc.stock)) {
    const item = itemOfStock(doc, packs, stock);
    if (!item) continue; // counts towards nothing, or its product is gone
    const key = minimumKey(stock.locationId, item.id);
    const group = groups.get(key) ?? { locationId: stock.locationId, item, rows: [] };
    group.rows.push(stock);
    groups.set(key, group);
  }
  // A minimum on an item with no stock at all is a shortfall of the whole minimum.
  for (const key of Object.keys(doc.minimums)) {
    if (groups.has(key)) continue;
    const bar = key.indexOf('|');
    const item = packs.items[key.slice(bar + 1)];
    if (item) groups.set(key, { locationId: key.slice(0, bar), item, rows: [] });
  }

  /** What `qty` packs of this stock row give, per resource (and one device if it is a radio). */
  const rowGives = (stock: Stock, item: Item): { resource: string; amount: number }[] => {
    const product = doc.products[stock.productId]!;
    return [
      ...packGives(product, item).map((g) => ({
        resource: g.resource,
        amount: g.amount * stock.qty,
      })),
      ...(item.tags.includes('radio-rx') ? [{ resource: DEVICE, amount: stock.qty }] : []),
    ];
  };

  for (const [key, { locationId, item, rows }] of groups) {
    const location = doc.locations[locationId];
    const listed = [
      ...item.gives.map((g) => g.resource as string),
      ...(item.tags.includes('radio-rx') ? [DEVICE] : []),
    ];
    const live = rows.filter((r) => !(r.bestBefore && r.bestBefore < month));
    const expired = rows.filter((r) => r.bestBefore && r.bestBefore < month);
    for (const e of expired)
      for (const resource of listed)
        push(resource, {
          kind: 'stock',
          id: e.id,
          amount: 0,
          expired: true,
          note: `best before ${e.bestBefore} has passed`,
        });

    for (const row of expired)
      for (const g of rowGives(row, item)) {
        fuelLots.push({
          stockId: row.id,
          productId: row.productId,
          itemId: item.id,
          locationId,
          heldPacks: row.qty,
          countedPacks: 0,
          resource: g.resource,
          resourceAmount: 0,
          remaining: 0,
          allocatedResource: 0,
          expired: true,
        });
      }
    const liveQty = live.reduce((n, r) => n + r.qty, 0);
    const fit = fitsHousehold(item, people);
    const gate = item.tags.includes('needs-cooking') ? ('cooking' as const) : undefined;
    const treatment = item.tags.includes('treatment');
    // Equipment is counted once, from the Equipment list: a stock row of an equipment item gives
    // nothing, and says why.
    const countsAsStock = fit && item.assetTypeId === undefined;
    const unfit = fit
      ? item.assetTypeId === undefined
        ? undefined
        : `${item.name} is equipment: add it under Home, Equipment so it counts once`
      : "does not fit anyone's age in the household";

    const factor =
      location?.kind === 'rotating'
        ? liveQty > 0
          ? Math.min(liveQty, doc.minimums[key] ?? 0) / liveQty
          : 0
        : 1;
    for (const row of live)
      for (const g of rowGives(row, item)) {
        const amount = countsAsStock ? g.amount * factor : 0;
        fuelLots.push({
          stockId: row.id,
          productId: row.productId,
          itemId: item.id,
          locationId,
          heldPacks: row.qty,
          countedPacks: countsAsStock ? row.qty * factor : 0,
          resource: g.resource,
          resourceAmount: amount,
          remaining: amount,
          allocatedResource: 0,
        });
      }
    if (location?.kind === 'rotating') {
      const minimum = doc.minimums[key];
      if (minimum !== undefined && liveQty < minimum)
        belowMinimum.push({ locationId, itemId: item.id, minimum, actual: liveQty });
      if (rows.length === 0 || (minimum === undefined && liveQty === 0)) continue;
      const counted = minimum === undefined ? 0 : Math.min(liveQty, minimum);
      if (counted > 0 && countsAsStock && treatment) hasTreatmentItem = true;
      // The counted packs give the average of what the live packs give.
      const totals = new Map<string, number>(listed.map((r) => [r, 0]));
      for (const r of live)
        for (const g of rowGives(r, item))
          totals.set(g.resource, (totals.get(g.resource) ?? 0) + g.amount);
      const factor = liveQty > 0 ? counted / liveQty : 0;
      for (const [resource, total] of totals) {
        push(resource, {
          kind: 'minimum',
          id: key,
          amount: countsAsStock ? total * factor : 0,
          ...(gate ? { gate } : {}),
          ...(unfit
            ? { note: unfit }
            : minimum === undefined
              ? { note: `rotating location with no minimum: ${fmt(liveQty)} held, none relied on` }
              : counted < liveQty
                ? { note: `counted at the minimum of ${fmt(minimum)}, ${fmt(liveQty)} held` }
                : {}),
        });
      }
    } else {
      for (const row of live) {
        if (row.qty > 0 && countsAsStock && treatment) hasTreatmentItem = true;
        for (const g of rowGives(row, item))
          push(g.resource, {
            kind: 'stock',
            id: row.id,
            amount: countsAsStock ? g.amount : 0,
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
  const converters = activeConverters(doc, packs);
  const runtime: EquipmentRuntime[] = [];
  for (const asset of Object.values(doc.assets).sort((a, b) => a.id.localeCompare(b.id))) {
    const type = packs.assets[asset.typeId];
    if (!type) continue;
    for (const [index, c] of type.contributes.entries()) {
      if (!c.converts) continue;
      const e = equipmentEligibility(type, c, asset.answers);
      const applies = whenOk(c, asset);
      runtime.push({
        assetId: asset.id,
        assetTypeId: type.id,
        contributionKey: `${type.id}:${index}`,
        name: asset.name ?? type.name,
        capability: c.capability,
        status:
          !applies ||
          (c.converts.fuel.indoorQuestion &&
            asset.answers[c.converts.fuel.indoorQuestion] === 'not permitted') ||
          (c.converts.fuel.highRiseQuestion &&
            asset.answers[c.converts.fuel.highRiseQuestion] === 'yes')
            ? 'blocked'
            : e.reasons.length
              ? 'unknown'
              : 'no-fuel',
        reasons: !applies ? ['operating-mode'] : e.reasons,
        selectedItemIds: e.itemId ? [e.itemId] : [],
        ...(e.perHour ? { rate: e.perHour } : {}),
        ...(e.output ? { output: e.output } : {}),
        ...((c.converts.rateOverrideQuestion &&
          asset.answers[c.converts.rateOverrideQuestion] !== undefined) ||
        (c.converts.perHourFrom && asset.answers[c.converts.perHourFrom] !== undefined)
          ? { source: 'manual' }
          : c.source
            ? { source: c.source }
            : {}),
        ...((c.converts.rateOverrideQuestion &&
          asset.answers[c.converts.rateOverrideQuestion] !== undefined) ||
        (c.converts.perHourFrom && asset.answers[c.converts.perHourFrom] !== undefined)
          ? { note: 'Fuel use entered from the equipment manual.' }
          : c.note
            ? { note: c.note }
            : {}),
        sharingAssetIds: [],
        inputLots: [],
      });
    }
  }
  const fuelLeft = new Map<string, number>();
  const caps: CapabilityId[] = ['cooking', 'heat', 'power'];
  for (const capability of caps) {
    const targetId = capabilityTargetId(capability);
    const target = targetId ? tById.get(targetId) : undefined;
    let need = Math.max(
      0,
      (target?.amount ?? 0) - sum(targetId ? extras.get(targetId) : undefined),
    );
    const here = converters.filter((c) => c.capability === capability);
    for (const itemId of [...new Set(here.map((c) => c.itemId))].sort()) {
      for (const resource of [
        ...new Set(here.filter((c) => c.itemId === itemId).map((c) => c.resource)),
      ].sort()) {
        const choices = here
          .filter((c) => c.itemId === itemId && c.resource === resource)
          .sort(
            (a, b) =>
              b.output / b.perHour - a.output / a.perHour ||
              a.asset.typeId.localeCompare(b.asset.typeId) ||
              a.asset.id.localeCompare(b.asset.id) ||
              a.contributionKey.localeCompare(b.contributionKey),
          );
        const best = choices[0]!;
        const lots = fuelLots
          .filter((l) => l.itemId === itemId && l.resource === best.resource)
          .sort((a, b) => a.stockId.localeCompare(b.stockId));
        const available = lots.reduce((n, l) => n + l.remaining, 0);
        const hours = available / best.perHour;
        const claim = Math.min(hours * best.output, need);
        let consume = (claim / best.output) * best.perHour;
        need -= claim;
        for (const c of choices) {
          const r = runtime.find(
            (r) => r.assetId === c.asset.id && r.contributionKey === c.contributionKey,
          )!;
          r.status = c === best ? (available > 0 ? 'counted' : 'no-fuel') : 'alternative';
          r.availableHours = available / c.perHour;
          r.allocatedHours = c === best ? claim / c.output : 0;
          if (target && target.amount > 0 && target.days > 0 && c === best)
            r.days = claim / (target.amount / target.days);
          r.sharingAssetIds = [
            ...new Set(
              converters
                .filter((x) => x.itemId === c.itemId && x.asset.id !== c.asset.id)
                .map((x) => x.asset.id),
            ),
          ].sort();
          r.inputLots = lots.map((lot) => ({
            stockId: lot.stockId,
            productId: lot.productId,
            itemId: lot.itemId,
            locationId: lot.locationId,
            heldPacks: lot.heldPacks,
            countedPacks: lot.countedPacks,
            resourceAmount: lot.resourceAmount,
            allocatedResource: 0,
            ...(lot.expired ? { expired: true } : {}),
          }));
        }
        const winner = runtime.find(
          (r) => r.assetId === best.asset.id && r.contributionKey === best.contributionKey,
        )!;
        for (const lot of lots) {
          const used = Math.min(lot.remaining, consume);
          const fraction = lot.remaining > 0 ? used / lot.remaining : 0;
          for (const other of fuelLots.filter((l) => l.stockId === lot.stockId))
            other.remaining *= 1 - fraction;
          consume -= used;
          winner.inputLots.find((l) => l.stockId === lot.stockId)!.allocatedResource = used;
        }
        if (claim > 0)
          extra(targetId, {
            kind: 'asset',
            id: best.asset.id,
            amount: claim,
            note: `${fmt(claim / best.output)} hours using ${itemId}`,
          });
      }
    }
  }
  for (const lot of fuelLots)
    fuelLeft.set(lot.resource, (fuelLeft.get(lot.resource) ?? 0) + lot.remaining);

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
                  kind: 'stock',
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

  return {
    targets: ts,
    coverage,
    belowMinimum,
    cookingMet,
    treatmentAvailable,
    people,
    equipmentRuntime: runtime,
  };
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

/** Runtime is a projection of the same allocation used by coverage. */
export function equipmentRuntime(
  doc: Document,
  packs: Packs,
  asOf: string,
  horizonDays = doc.settings.horizonDays,
): EquipmentRuntime[] {
  return analyse(doc, packs, asOf, horizonDays).equipmentRuntime;
}
