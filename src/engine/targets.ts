import { STORE_INFO, type CapabilityId, type Document, type Packs, type StoreId } from '../model';
import { compareText } from '../util';
import { ASSUMPTIONS } from './assumptions';
import { CAPABILITY_ORDER, guidanceRules, peopleAt, type Person } from './context';
import { addMonths } from './dates';

export type TargetKind =
  /** An amount of a named store (water, food kcal, nappies). */
  | 'store'
  /** Running hours of a converter (heat, cooking). */
  | 'hours'
  /** Doses of one medication. */
  | 'medication'
  /** A distance to be able to drive (mobility). */
  | 'range'
  /** A thing to have (a radio for comms). */
  | 'device'
  /** A plan item to have done. */
  | 'plan';

export interface TargetRule {
  ruleId: string;
  text: string;
  source: string;
  /** How much of the target's amount this rule asked for, in the target's unit. */
  contribution: number;
}

export interface Target {
  /** Stable key: `<capability>:<store>`, `heat:hours`, `plan:<planItemId>` ... Coverage matches on it. */
  id: string;
  kind: TargetKind;
  /** For a plan item, the capability the plan item belongs to (it is scored under `plans`). */
  capability: CapabilityId;
  /** A `StoreId`, `medication:<id>` or `plan:<id>`; absent for hours, range and devices. */
  store?: StoreId | `medication:${string}` | `plan:${string}`;
  label: string;
  amount: number;
  unit: string;
  /** The horizon the amount was computed for. */
  days: number;
  /** A one-off amount (`perHousehold`), the same at every horizon: no days of cover. */
  fixed?: boolean;
  /** A critical medication. */
  critical?: boolean;
  planItemId?: string;
  medicationId?: string;
  rules: TargetRule[];
}

const ENGINE_COMMS_RULE = 'engine:comms-radio';

/** Whether a plan item is done on `asOf`: done, and not past its expiry. */
export function planDone(doc: Document, packs: Packs, planItemId: string, asOf: string): boolean {
  const entry = doc.plans[planItemId];
  if (!entry?.doneAt) return false;
  const expiresMonths = packs.plans[planItemId]?.expiresMonths;
  const expires =
    entry.expires ?? (expiresMonths ? addMonths(entry.doneAt, expiresMonths) : undefined);
  return expires === undefined || expires > asOf;
}

/**
 * Plan items an owned asset can already answer: the item is not a to-do once every owned asset it
 * `requires` has this question answered `true` (the EPS plan, once solar and the home battery are
 * fitted with one).
 */
export const ANSWERED_BY_ASSET: Readonly<Record<string, string>> = {
  'plans-base:eps': 'hasEps',
};

/** The plan items that apply to this household. */
export function applicablePlanItems(doc: Document, packs: Packs): string[] {
  const owned = new Set(Object.values(doc.assets).map((a) => a.typeId));
  const out: string[] = [];
  for (const pack of packs.enabledPacks(doc.settings)) {
    if (pack.kind !== 'plans') continue;
    for (const item of pack.items) {
      const r = item.requires;
      if (r?.risk && !doc.home.risks.includes(r.risk)) continue;
      if (r?.asset && !r.asset.some((a) => owned.has(a))) continue;
      const question = ANSWERED_BY_ASSET[item.id];
      if (
        question &&
        r?.asset &&
        Object.values(doc.assets)
          .filter((a) => r.asset!.includes(a.typeId))
          .every((a) => a.answers[question] === true)
      )
        continue;
      if (r?.pets && doc.household.pets.length === 0) continue;
      out.push(item.id);
    }
  }
  return out;
}

/**
 * What the household needs for `horizonDays` as of `asOf`, per capability: store amounts from the
 * guidance rules (people x days x amount, by age band, pet size and multipliers), running hours of
 * heat and cooking, doses per medication, a driving range, a radio, and the plan items that apply.
 * Zero-amount targets are left out (no baby, no nappies).
 */
export function targets(
  doc: Document,
  packs: Packs,
  asOf: string,
  horizonDays: number = doc.settings.horizonDays,
): Target[] {
  const days = horizonDays;
  const people = peopleAt(doc, asOf);
  const rules = guidanceRules(doc, packs, days);
  const byId = new Map<string, Target>();

  const add = (
    t: Omit<Target, 'amount' | 'rules' | 'days' | 'fixed'>,
    rule: TargetRule,
    fixed = false,
  ): void => {
    let target = byId.get(t.id);
    if (!target) {
      target = { ...t, amount: 0, days, rules: [] };
      if (fixed) target.fixed = true;
      byId.set(t.id, target);
    } else if (!fixed) {
      delete target.fixed;
    }
    target.rules.push(rule);
    target.amount += rule.contribution;
  };

  for (const rule of rules) {
    if (rule.minHorizonDays !== undefined && days < rule.minHorizonDays) continue;
    if (rule.appliesTo?.risk && !doc.home.risks.includes(rule.appliesTo.risk)) continue;
    const tag = rule.appliesTo?.tag;
    const covered = tag ? people.filter((p) => p.tags.includes(tag)) : people;
    if (tag && covered.length === 0) continue;

    // Multipliers multiply. A tag one matches the person (or, for household quantities, anyone).
    const factor = (person: Person | null): number => {
      let f = 1;
      for (const m of rule.multipliers ?? []) {
        const match = m.tag
          ? person
            ? person.tags.includes(m.tag)
            : people.some((p) => p.tags.includes(m.tag!))
          : m.risk
            ? doc.home.risks.includes(m.risk)
            : doc.home.insulation === m.insulation;
        if (match) f *= m.factor;
      }
      return f;
    };
    // An infant on formula is fed by the formula target, not also by the kcal one.
    const formulaFeeds = (p: Person): boolean =>
      rules.some((r) => {
        const f = r.perPersonDay;
        if (f?.store !== 'formulaG') return false;
        const band = f.ageBands?.find(
          (b) => p.ageMonths >= b.fromMonths && p.ageMonths < b.toMonths,
        );
        return (f.ageBands ? (band?.amount ?? 0) : f.amount) > 0;
      });
    const base = { ruleId: rule.id, text: rule.text, source: rule.source };
    const storeTarget = (store: StoreId, contribution: number, fixed = false) => {
      if (!(contribution > 0)) return;
      add(
        {
          id: `${rule.capability}:${store}`,
          kind: 'store',
          capability: rule.capability,
          store,
          label: STORE_INFO[store].name,
          unit: STORE_INFO[store].unit,
        },
        { ...base, contribution },
        fixed,
      );
    };

    if (rule.perPersonDay) {
      const q = rule.perPersonDay;
      if (q.store === 'medicationDays') continue; // computed per medication below
      let total = 0;
      for (const p of covered) {
        if (q.store === 'foodKcal' && formulaFeeds(p)) continue;
        const band = q.ageBands?.find(
          (b) => p.ageMonths >= b.fromMonths && p.ageMonths < b.toMonths,
        );
        const amount = q.ageBands ? (band?.amount ?? 0) : q.amount;
        total += amount * factor(p);
      }
      storeTarget(q.store, total * days);
    }
    if (rule.perPetDay) {
      const q = rule.perPetDay;
      let total = 0;
      for (const pet of doc.household.pets)
        total += (q.bySize?.[pet.size] ?? q.amount) * factor(null);
      storeTarget(q.store, total * days);
    }
    if (rule.perHouseholdDay) {
      storeTarget(rule.perHouseholdDay.store, rule.perHouseholdDay.amount * factor(null) * days);
    }
    if (rule.perHousehold) {
      storeTarget(rule.perHousehold.store, rule.perHousehold.amount, true);
    }
    if (rule.hoursPerDay !== undefined) {
      add(
        {
          id: `${rule.capability}:hours`,
          kind: 'hours',
          capability: rule.capability,
          label: rule.capability,
          unit: 'h',
        },
        { ...base, contribution: rule.hoursPerDay * factor(null) * days },
      );
    }
    if (rule.mealsPerPersonDay !== undefined) {
      let meals = 0;
      for (const p of covered) meals += rule.mealsPerPersonDay * factor(p) * days;
      if (meals > 0) {
        add(
          {
            id: `${rule.capability}:hours`,
            kind: 'hours',
            capability: rule.capability,
            label: rule.capability,
            unit: 'h',
          },
          { ...base, contribution: meals * ASSUMPTIONS.cookingHoursPerPersonMeal.value },
        );
      }
    }
    if (rule.rangeKm !== undefined) {
      add(
        {
          id: `${rule.capability}:range`,
          kind: 'range',
          capability: rule.capability,
          label: 'driving range',
          unit: 'km',
        },
        { ...base, contribution: rule.rangeKm },
      );
    }
  }

  // Medication: one target per medication in the household, whatever the pack says.
  const medicationRule = rules.find((r) => r.perPersonDay?.store === 'medicationDays');
  for (const member of doc.household.members) {
    for (const med of member.medication) {
      if (!(med.dosePerDay > 0)) continue;
      const amount = med.dosePerDay * days;
      add(
        {
          id: `medical:medication:${med.id}`,
          kind: 'medication',
          capability: 'medical',
          store: `medication:${med.id}`,
          label: med.name,
          unit: 'doses',
          critical: med.critical,
          medicationId: med.id,
        },
        {
          ruleId: medicationRule?.id ?? 'engine:medication',
          text: medicationRule?.text ?? 'Enough doses of every medication for the horizon.',
          source: medicationRule?.source ?? 'assumption',
          contribution: amount,
        },
      );
    }
  }

  // A radio: comms has no store, so the engine asks for one device.
  add(
    {
      id: 'comms:radio',
      kind: 'device',
      capability: 'comms',
      label: 'radio',
      unit: 'radio',
    },
    {
      ruleId: ENGINE_COMMS_RULE,
      text: ASSUMPTIONS.radiosPerHousehold.text,
      source: 'assumption',
      contribution: ASSUMPTIONS.radiosPerHousehold.value,
    },
  );

  // Plan items: scored together under `plans`, grouped for display by their own capability.
  for (const planId of applicablePlanItems(doc, packs)) {
    const def = packs.plans[planId]!;
    byId.set(`plan:${planId}`, {
      id: `plan:${planId}`,
      kind: 'plan',
      capability: def.capability,
      store: `plan:${planId}`,
      label: def.text,
      amount: 1,
      unit: 'done',
      days,
      planItemId: planId,
      rules: [{ ruleId: planId, text: def.text, source: planId.split(':')[0]!, contribution: 1 }],
    });
  }

  const order = (t: Target) => CAPABILITY_ORDER.indexOf(t.capability);
  return [...byId.values()]
    .filter((t) => t.amount > 0)
    .sort((a, b) => order(a) - order(b) || compareText(a.id, b.id));
}
