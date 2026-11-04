import {
  ItemTypeSchema,
  STORE_IDS,
  STORE_INFO,
  type Category,
  type ItemType,
  type StoreId,
} from '../../../model';
import { customTypeId } from '../../../packs';

/**
 * The store a category most plausibly gives, offered first when making a custom item. Categories
 * with no obvious store (tools, security, comfort, comms, heat, fuel) have none: the item is then
 * listed but counts for nothing unless the household picks one.
 */
export const DEFAULT_STORE: Partial<Record<Category, StoreId>> = {
  water: 'waterL',
  food: 'foodKcal',
  power: 'batteryWh',
  light: 'lumenHours',
  medical: 'firstAid',
  baby: 'nappies',
  pets: 'petFoodKcal',
  sanitation: 'sanitationUses',
};

/** Categories whose custom items must say what they give, or they would count for nothing. */
export const NEEDS_GIVES: ReadonlySet<Category> = new Set(['food', 'water']);

/** The stores a custom item may give (a medication's days are worked out, never held). */
export const GIVEABLE_STORES: readonly StoreId[] = STORE_IDS.filter((s) => s !== 'medicationDays');

/** "How many kcal of food in one tin?" */
export function givesPrompt(store: StoreId, unit: string): string {
  const info = STORE_INFO[store];
  return `How many ${info.unit} of ${info.name} in one ${unit.trim() || 'piece'}?`;
}

export interface CustomTypeInput {
  name: string;
  category: Category;
  unit: string;
  store?: StoreId;
  amount?: number;
}

export type CustomTypeResult = { ok: true; type: ItemType } | { ok: false; problem: string };

/**
 * A custom item type from the form: needs a name and a category, and food and water also say what
 * one piece gives ("about how many kcal?", litres). It suits every place (nothing is known about
 * it), keeps no best-before by default and is tagged `custom`. `uuid` makes its id
 * (`custom:<uuid>`).
 */
export function buildCustomType(input: CustomTypeInput, uuid: string): CustomTypeResult {
  const name = input.name.trim();
  if (name === '') return { ok: false, problem: 'Give it a name.' };
  const unit = input.unit.trim() || 'each';
  const gives =
    input.store && input.amount !== undefined && input.amount > 0
      ? [{ store: input.store, amount: input.amount }]
      : [];
  if (gives.length === 0 && NEEDS_GIVES.has(input.category)) {
    const store = DEFAULT_STORE[input.category]!;
    return { ok: false, problem: givesPrompt(store, unit) };
  }
  const parsed = ItemTypeSchema.safeParse({
    id: customTypeId(uuid),
    name,
    category: input.category,
    unit,
    gives,
    suitability: ['frost', 'heat', 'damp'],
    shelfLife: 'none',
    tags: ['custom'],
  });
  return parsed.success
    ? { ok: true, type: parsed.data }
    : { ok: false, problem: 'That does not look right: check the name and the amount.' };
}
