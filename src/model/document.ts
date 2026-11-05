import { z } from 'zod';
import {
  ConditionSchema,
  InsulationSchema,
  IsoDateSchema,
  LocalRiskSchema,
  RegionSchema,
  RiskTagSchema,
  SizeSchema,
} from './primitives';

/**
 * The household document: the one thing a user owns. It lives in a CRDT in the browser and merges
 * through Google Drive, so records that devices add concurrently are keyed objects, not
 * arrays. `members` and `pets` are small arrays whose elements carry ids.
 *
 * Ids are strings: `crypto.randomUUID()` for instances, `"<packId>:<localId>"` for pack things.
 * Dates are ISO `YYYY-MM-DD`, month-only dates `YYYY-MM`, timestamps ISO strings.
 */
export const SCHEMA_VERSION = 4;

/** The deploy targets (the footer shows one; `src/util/build-env.ts` re-exports this type). */
export const ENVS = ['local', 'preview', 'dev', 'next', 'staging', 'prod'] as const;
export const EnvSchema = z.enum(ENVS);
export type Env = z.infer<typeof EnvSchema>;

const Id = z.string().min(1);
export const YearMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'expected YYYY-MM');
const Timestamp = z.iso.datetime({ offset: true });

/**
 * The packs a new document enables. Region-specific packs are filtered by `settings.region`, so
 * one list serves both regions. A test checks every id exists in `src/packs/data`.
 */
export const DEFAULT_PACKS = [
  'items-base',
  'assets-base',
  'guidance-grid-free',
  'guidance-uk-prepare',
  'guidance-us-ready',
  'plans-base',
  'regions',
] as const;

export const MetaSchema = z.object({
  schemaVersion: z.number().int().min(1),
  env: EnvSchema,
  /** Random device ids, each added by the device that first writes to this document. */
  devices: z.array(z.string()),
  createdAt: Timestamp,
  /** `packId` to the pack `version` when the document first used it (a mismatch is reported). */
  packVersions: z.record(z.string(), z.number().int()),
});
export type Meta = z.infer<typeof MetaSchema>;

export const MedicationSchema = z.object({
  id: Id,
  name: z.string(),
  dosePerDay: z.number().min(0),
  unitsOnHand: z.number().min(0),
  cycleDays: z.number().int().min(1).optional(),
  critical: z.boolean(),
});
export type Medication = z.infer<typeof MedicationSchema>;

export const MemberSchema = z.object({
  id: Id,
  name: z.string(),
  dob: IsoDateSchema,
  tags: z.array(RiskTagSchema),
  dietary: z.string().optional(),
  medication: z.array(MedicationSchema),
});
export type Member = z.infer<typeof MemberSchema>;

export const PetSchema = z.object({
  id: Id,
  name: z.string(),
  species: z.enum(['dog', 'cat', 'other']),
  size: z.enum(['S', 'M', 'L']),
});
export type Pet = z.infer<typeof PetSchema>;

export const HouseholdSchema = z.object({
  members: z.array(MemberSchema),
  pets: z.array(PetSchema),
});
export type Household = z.infer<typeof HouseholdSchema>;

export const HOME_TYPES = ['flat', 'terrace', 'semi', 'detached', 'bungalow', 'other'] as const;
export const HEATINGS = [
  'gas-boiler',
  'oil-boiler',
  'electric',
  'heat-pump',
  'wood-burner',
  'lpg',
  'other',
] as const;
export const COOKINGS = ['gas', 'electric', 'induction', 'lpg', 'other'] as const;
export const HomeTypeSchema = z.enum(HOME_TYPES);
export const HeatingSchema = z.enum(HEATINGS);
export const CookingSchema = z.enum(COOKINGS);
export type HomeType = z.infer<typeof HomeTypeSchema>;
export type Heating = z.infer<typeof HeatingSchema>;
export type Cooking = z.infer<typeof CookingSchema>;

export const HomeSchema = z.object({
  type: HomeTypeSchema,
  floors: z.number().int().min(1),
  insulation: InsulationSchema,
  heating: HeatingSchema,
  cooking: CookingSchema,
  mainsGas: z.boolean(),
  solar: z.boolean(),
  homeBattery: z.boolean(),
  evCharger: z.boolean(),
  growing: z.enum(['none', 'small', 'large']),
  risks: z.array(LocalRiskSchema),
  /** A postcode district or a coarse label; never a full address. */
  area: z.string().optional(),
  region: RegionSchema,
  /**
   * A subregion id from `regions.json` (for the UK: `'scotland' | 'england' | 'wales' |
   * 'northern-ireland'`), which picks the regional risk links. Checked against the regions pack by
   * `subregionIssue` in `src/packs/loader.ts`, not by this schema, which cannot see the packs.
   */
  subregion: z.string().optional(),
});
export type Home = z.infer<typeof HomeSchema>;

export const LocationSchema = z.object({
  id: Id,
  name: z.string(),
  kind: z.enum(['rotating', 'stored']),
  conditions: z.array(ConditionSchema),
  size: z.enum(['S', 'M', 'L']),
  litres: z.number().min(0).optional(),
});
export type Location = z.infer<typeof LocationSchema>;

export const AssetSchema = z.object({
  id: Id,
  /** A pack-namespaced asset type id. */
  typeId: Id,
  name: z.string().optional(),
  locationId: Id.optional(),
  purchased: IsoDateSchema.optional(),
  notes: z.string().optional(),
  /** Answers to the asset type's questions, keyed by question id. */
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  /** Maintenance item id to the date it was last done. */
  maintenance: z.record(z.string(), IsoDateSchema),
});
export type Asset = z.infer<typeof AssetSchema>;

/** The household's own specific thing: what it is called, its size, what it counts as. */
export const ProductSchema = z.object({
  id: Id,
  name: z.string().min(1),
  /** The pack item it counts as; absent: it counts towards nothing (kept, listed, scores nothing). */
  itemId: Id.optional(),
  size: SizeSchema,
  /** kcal per 100 g or 100 ml from the label (Open Food Facts), when known; replaces the item's typical. */
  labelKcalPer100: z.number().min(0).optional(),
  added: IsoDateSchema,
});
export type Product = z.infer<typeof ProductSchema>;

/** A quantity of one product in one place, with its best-before month. Quarters allowed (part-used packs). */
export const StockSchema = z.object({
  id: Id,
  productId: Id,
  qty: z
    .number()
    .positive()
    .refine((q) => Number.isInteger(q * 4), 'whole packs or quarters'),
  locationId: Id,
  bestBefore: YearMonthSchema.optional(),
  added: IsoDateSchema,
  source: z.enum(['manual', 'barcode']),
});
export type Stock = z.infer<typeof StockSchema>;

/**
 * Minimums are keyed `minimumKey(locationId, itemId)`: the least kept of an item in a rotating
 * place, in packs of any of its products.
 */
export const minimumKey = (locationId: string, itemId: string): string => `${locationId}|${itemId}`;

export const PlanItemSchema = z.object({
  doneAt: IsoDateSchema.optional(),
  expires: IsoDateSchema.optional(),
  note: z.string().optional(),
});
export type PlanItem = z.infer<typeof PlanItemSchema>;

export const ReviewSchema = z.object({
  id: Id,
  started: Timestamp,
  finished: Timestamp.optional(),
  resolved: z.array(z.string()),
  scoreBefore: z.number().optional(),
  scoreAfter: z.number().optional(),
});
export type Review = z.infer<typeof ReviewSchema>;

/** A barcode the household has met: which product it is. Keyed by `normaliseGtin(code)`. */
export const BarcodeSchema = z.object({
  productId: Id,
  /** First remembered (not updated on every scan: no churn). */
  seen: IsoDateSchema,
});
export type Barcode = z.infer<typeof BarcodeSchema>;

/** What Open Food Facts said about a queued scan, once looked up: enough to make the product later. */
export const OffFactsSchema = z.object({
  found: z.boolean(),
  name: z.string().optional(),
  brand: z.string().optional(),
  /** OFF's own `quantity` text, e.g. "24 x 330 ml". */
  quantity: z.string().optional(),
  size: SizeSchema.optional(),
  kcalPer100: z.number().min(0).optional(),
  /** OFF categories_tags (at most 20). A value array merges as a set: order is not kept, and not used. */
  categories: z.array(z.string()).max(20).optional(),
  checked: Timestamp,
});
export type OffFacts = z.infer<typeof OffFactsSchema>;

/** A scan saved for later: the product isn't chosen yet, so it counts towards nothing. */
export const ScanSchema = z.object({
  id: Id,
  code: z.string().regex(/^\d{8,14}$/),
  qty: z.number().int().min(1),
  locationId: Id,
  bestBefore: YearMonthSchema.optional(),
  scanned: Timestamp,
  off: OffFactsSchema.optional(),
});
export type Scan = z.infer<typeof ScanSchema>;

export const SettingsSchema = z.object({
  horizonDays: z.union([z.literal(3), z.literal(7), z.literal(14), z.literal(28)]),
  region: RegionSchema,
  packs: z.array(z.string()),
  reviewCadenceMonths: z.union([z.literal(3), z.literal(6)]),
  anonymise: z.boolean(),
  /** Months ahead (0 to 3) that count as "Expires soon". Absent: 1. Added in schema 3. */
  expirySoonMonths: z.number().int().min(0).max(3).optional(),
  /** Months ahead (1 to 12) that count as "Before next check". Absent: 3. Added in schema 3. */
  expiryCheckMonths: z.number().int().min(1).max(12).optional(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DocumentSchema = z.object({
  meta: MetaSchema,
  household: HouseholdSchema,
  home: HomeSchema,
  locations: z.record(Id, LocationSchema),
  assets: z.record(Id, AssetSchema),
  /** The household's products, keyed by id. Added in schema 4. */
  products: z.record(Id, ProductSchema),
  /** Remembered barcodes: normalised GTIN to the product it is. */
  barcodes: z.record(z.string(), BarcodeSchema),
  /** Quantities of products in places, keyed by id. */
  stock: z.record(Id, StockSchema),
  /** Scans waiting to be sorted into stock, keyed by id. */
  scans: z.record(Id, ScanSchema),
  /** Minimum kept of an item in a rotating place, keyed by `minimumKey`. */
  minimums: z.record(z.string(), z.number().int().min(1)),
  /** Keyed by pack-namespaced plan item id. */
  plans: z.record(z.string(), PlanItemSchema),
  reviews: z.record(Id, ReviewSchema),
  settings: SettingsSchema,
});
export type Document = z.infer<typeof DocumentSchema>;

/** A fresh, valid, empty document. `now` is injectable for tests. */
export function emptyDocument(env: Env, now: string = new Date().toISOString()): Document {
  return {
    meta: { schemaVersion: SCHEMA_VERSION, env, devices: [], createdAt: now, packVersions: {} },
    household: { members: [], pets: [] },
    home: {
      type: 'other',
      floors: 1,
      insulation: 'average',
      heating: 'other',
      cooking: 'other',
      mainsGas: true,
      solar: false,
      homeBattery: false,
      evCharger: false,
      growing: 'none',
      risks: [],
      region: 'UK',
    },
    locations: {},
    assets: {},
    products: {},
    barcodes: {},
    stock: {},
    scans: {},
    minimums: {},
    plans: {},
    reviews: {},
    settings: {
      horizonDays: 3,
      region: 'UK',
      packs: [...DEFAULT_PACKS],
      reviewCadenceMonths: 6,
      anonymise: false,
    },
  };
}
