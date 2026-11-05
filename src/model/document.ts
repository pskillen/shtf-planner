import { z } from 'zod';
import { ItemTypeSchema } from './packs';
import {
  ConditionSchema,
  InsulationSchema,
  IsoDateSchema,
  LocalRiskSchema,
  RegionSchema,
  RiskTagSchema,
} from './primitives';

/**
 * The household document: the one thing a user owns. It lives in a CRDT in the browser and merges
 * through Google Drive, so records that devices add concurrently are keyed objects, not
 * arrays. `members` and `pets` are small arrays whose elements carry ids.
 *
 * Ids are strings: `crypto.randomUUID()` for instances, `"<packId>:<localId>"` for pack things.
 * Dates are ISO `YYYY-MM-DD`, month-only dates `YYYY-MM`, timestamps ISO strings.
 */
export const SCHEMA_VERSION = 3;

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

export const ItemInstanceSchema = z.object({
  id: Id,
  /** A pack-namespaced item type id. */
  typeId: Id,
  qty: z.number().min(0),
  locationId: Id,
  bestBefore: YearMonthSchema.optional(),
  added: IsoDateSchema,
  source: z.enum(['manual', 'barcode']),
});
export type ItemInstance = z.infer<typeof ItemInstanceSchema>;

/** Floors are keyed `${locationId}|${typeId}`. */
export const floorKey = (locationId: string, typeId: string): string => `${locationId}|${typeId}`;

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

/** A barcode the household has told the app about: which item type it is. Keyed by `normaliseGtin(code)`. */
export const BarcodeSchema = z.object({
  /** A pack or custom item type id; never an equipment entry. */
  typeId: Id,
  /** What Open Food Facts called it, for display ("Heinz baked beans 415 g"). */
  name: z.string().optional(),
  /** First remembered (not updated on every scan: no churn). */
  seen: IsoDateSchema,
});
export type Barcode = z.infer<typeof BarcodeSchema>;

/** What Open Food Facts said about a queued scan, once looked up. */
export const ProductInfoSchema = z.object({
  found: z.boolean(),
  name: z.string().optional(),
  /** OFF's `quantity` text, e.g. "415 g". */
  quantity: z.string().optional(),
  checked: Timestamp,
});
export type ProductInfo = z.infer<typeof ProductInfoSchema>;

/** A scan saved for later: the type isn't chosen yet, so it counts towards nothing. */
export const ScanSchema = z.object({
  id: Id,
  code: z.string().regex(/^\d{8,14}$/),
  qty: z.number().int().min(1),
  locationId: Id,
  bestBefore: YearMonthSchema.optional(),
  scanned: Timestamp,
  product: ProductInfoSchema.optional(),
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
  items: z.record(Id, ItemInstanceSchema),
  /**
   * Item types the household made itself ("Add as a custom item"), keyed by id (`custom:<uuid>`).
   * The packs are read-only content; these sit beside them as a pseudo-pack `custom`
   * (`withCustomTypes` in `src/packs`). Added in schema 2.
   */
  customTypes: z.record(Id, ItemTypeSchema),
  /** Remembered barcodes: normalised GTIN to the item type it is. Added in schema 3. */
  barcodes: z.record(z.string(), BarcodeSchema),
  /** Scans waiting to be sorted into stock, keyed by id. Added in schema 3. */
  scans: z.record(Id, ScanSchema),
  /** Minimum level counted for rotating locations, keyed by `floorKey`. */
  floors: z.record(z.string(), z.number().min(0)),
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
    items: {},
    customTypes: {},
    barcodes: {},
    scans: {},
    floors: {},
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
