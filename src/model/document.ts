import { z } from 'zod';

/**
 * The household document: the one thing a user owns. It lives in a CRDT in the browser and merges
 * through Google Drive (P6), so records that devices add concurrently are keyed objects, not
 * arrays. `members` and `pets` are small arrays whose elements carry ids.
 *
 * Ids are strings: `crypto.randomUUID()` for instances, `"<packId>:<localId>"` for pack things.
 * Dates are ISO `YYYY-MM-DD`, month-only dates `YYYY-MM`, timestamps ISO strings.
 */
export const SCHEMA_VERSION = 1;

/** The deploy targets (the footer shows one; `src/util/build-env.ts` re-exports this type). */
export const ENVS = ['local', 'preview', 'dev', 'next', 'staging', 'prod'] as const;
export const EnvSchema = z.enum(ENVS);
export type Env = z.infer<typeof EnvSchema>;

const Id = z.string().min(1);
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
export const YearMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'expected YYYY-MM');
const Timestamp = z.iso.datetime({ offset: true });

export const REGIONS = ['UK', 'US'] as const;
export const RegionSchema = z.enum(REGIONS);
export type Region = z.infer<typeof RegionSchema>;

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

export const RISK_TAGS = [
  'infant',
  'child',
  'pregnant',
  'elderly',
  'reduced-mobility',
  'hearing-or-sight',
  'dietary',
  'powered-equipment',
  'takes-medication',
] as const;
export const RiskTagSchema = z.enum(RISK_TAGS);
export type RiskTag = z.infer<typeof RiskTagSchema>;

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
export const INSULATIONS = ['poor', 'average', 'good', 'excellent'] as const;
export const LOCAL_RISKS = [
  'flood',
  'coastal',
  'storm',
  'snow',
  'heat',
  'wildfire',
  'grid',
  'water-supply',
  'remote',
  'unrest',
  'pandemic',
] as const;
export const HomeTypeSchema = z.enum(HOME_TYPES);
export const HeatingSchema = z.enum(HEATINGS);
export const CookingSchema = z.enum(COOKINGS);
export const InsulationSchema = z.enum(INSULATIONS);
export const LocalRiskSchema = z.enum(LOCAL_RISKS);
export type HomeType = z.infer<typeof HomeTypeSchema>;
export type Heating = z.infer<typeof HeatingSchema>;
export type Cooking = z.infer<typeof CookingSchema>;
export type Insulation = z.infer<typeof InsulationSchema>;
export type LocalRisk = z.infer<typeof LocalRiskSchema>;

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
});
export type Home = z.infer<typeof HomeSchema>;

export const CONDITIONS = ['frost', 'heat', 'damp', 'indoor-stable'] as const;
export const ConditionSchema = z.enum(CONDITIONS);
export type Condition = z.infer<typeof ConditionSchema>;

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

export const SettingsSchema = z.object({
  horizonDays: z.union([z.literal(3), z.literal(7), z.literal(14), z.literal(28)]),
  region: RegionSchema,
  packs: z.array(z.string()),
  reviewCadenceMonths: z.union([z.literal(3), z.literal(6)]),
  anonymise: z.boolean(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DocumentSchema = z.object({
  meta: MetaSchema,
  household: HouseholdSchema,
  home: HomeSchema,
  locations: z.record(Id, LocationSchema),
  assets: z.record(Id, AssetSchema),
  items: z.record(Id, ItemInstanceSchema),
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
