import { z } from 'zod';
import {
  ConditionSchema,
  InsulationSchema,
  IsoDateSchema,
  LocalRiskSchema,
  RegionSchema,
  RiskTagSchema,
  type Region,
  type Settings,
} from './document';

/**
 * Content packs: versioned JSON that ships in the bundle (so it works offline) and is validated
 * with these schemas by `src/packs/loader.ts`. Ids inside a pack are namespaced `"<packId>:<local>"`
 * and written out in full in the JSON, so a reference to a thing in another pack is greppable.
 * Pack schemas are strict: a typo in a key is an error, not silently ignored.
 */

export const CAPABILITIES = [
  'water',
  'food',
  'heat',
  'cooking',
  'light',
  'power',
  'comms',
  'sanitation',
  'medical',
  'mobility',
  'plans',
] as const;
export const CapabilityIdSchema = z.enum(CAPABILITIES);
export type CapabilityId = z.infer<typeof CapabilityIdSchema>;

/**
 * The named quantities a household holds. The game's thirteen plus those the planner needs.
 * `medicationDays` is computed per medication from the document, never held as stock, so an item
 * type may not give it.
 */
export const STORE_INFO = {
  waterL: { name: 'water', unit: 'L' },
  waterRaw: { name: 'untreated water', unit: 'L' },
  purificationTabs: { name: 'purification tablets', unit: 'tablets' },
  bleachMl: { name: 'bleach', unit: 'ml' },
  foodKcal: { name: 'food', unit: 'kcal' },
  gasCanister: { name: 'gas canisters', unit: 'canisters' },
  paraffinL: { name: 'paraffin', unit: 'L' },
  petrolL: { name: 'petrol', unit: 'L' },
  batteryWh: { name: 'battery charge', unit: 'Wh' },
  firstAid: { name: 'first-aid supplies', unit: 'uses' },
  woodKg: { name: 'firewood', unit: 'kg' },
  lpgKg: { name: 'bottled gas', unit: 'kg' },
  candleHours: { name: 'candles', unit: 'h' },
  nappies: { name: 'nappies', unit: 'nappies' },
  formulaG: { name: 'infant formula', unit: 'g' },
  petFoodKcal: { name: 'pet food', unit: 'kcal' },
  sanitationUses: { name: 'toilet uses', unit: 'uses' },
  hygieneUses: { name: 'hygiene supplies', unit: 'uses' },
  medicationDays: { name: 'medication', unit: 'days' },
  lumenHours: { name: 'light', unit: 'lumen-hours' },
} as const;
export type StoreId = keyof typeof STORE_INFO;
export const STORE_IDS = Object.keys(STORE_INFO) as [StoreId, ...StoreId[]];
export const StoreIdSchema = z.enum(STORE_IDS);

export const CATEGORIES = [
  'water',
  'food',
  'heat',
  'power',
  'fuel',
  'light',
  'medical',
  'comms',
  'tools',
  'security',
  'comfort',
  'baby',
  'pets',
  'sanitation',
] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

const Text = z.string().min(1);
const Url = z.string().regex(/^https:\/\/\S+$/, 'expected an https URL');
const Months = z.number().int().min(0);
const AgeBand = z.strictObject({ fromMonths: Months, toMonths: Months });

/** A pack-namespaced id: `"<packId>:<localId>"`. */
export const NamespacedId = z.string().regex(/^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/, {
  message: 'expected "<packId>:<localId>" in lower-case kebab-case',
});

export const SourceSchema = z.strictObject({
  url: Url,
  title: Text,
  checked: IsoDateSchema,
});
export type Source = z.infer<typeof SourceSchema>;

const packBase = {
  format: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'pack ids are lower-case kebab-case'),
  version: z.number().int().min(1),
  name: Text,
  region: RegionSchema.optional(),
  sources: z.array(SourceSchema).optional(),
};

// ---- items ----

export const ItemTypeSchema = z.strictObject({
  id: NamespacedId,
  name: Text,
  category: CategorySchema,
  /** What one counted piece is: "tin", "L", "kg", "pack". */
  unit: Text,
  unitSize: z.string().optional(),
  gives: z.array(
    z.strictObject({
      store: StoreIdSchema,
      amount: z.number().positive(),
    }),
  ),
  /** Conditions it tolerates. `indoor-stable` is always fine. */
  suitability: z.array(ConditionSchema),
  shelfLife: z.enum(['none', 'years', 'year', 'months', 'weeks']),
  ageBand: AgeBand.optional(),
  typicalPricePence: z.number().int().min(0).optional(),
  tags: z.array(z.string()),
  barcodes: z.array(z.string()).optional(),
});
export type ItemType = z.infer<typeof ItemTypeSchema>;

export const ItemsPackSchema = z.strictObject({
  ...packBase,
  kind: z.literal('items'),
  items: z.array(ItemTypeSchema),
});

// ---- assets ----

export const QuestionSchema = z.strictObject({
  /** Local to the asset type: `answers` in the document are keyed by it. */
  id: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/),
  text: Text,
  kind: z.enum(['bool', 'number', 'choice']),
  choices: z.array(Text).optional(),
  unit: z.string().optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

const AnswerValue = z.union([z.string(), z.number(), z.boolean()]);
const FromQuestion = z.strictObject({ fromQuestion: z.string() });

export const ContributionSchema = z.strictObject({
  capability: CapabilityIdSchema,
  /** Counts only while the asset's answer to `question` equals `equals`. */
  when: z.strictObject({ question: z.string(), equals: AnswerValue }).optional(),
  /** Burns `store` while running: `perHour` units per hour, or the answer to a question. */
  converts: z
    .strictObject({
      store: StoreIdSchema,
      perHour: z.number().positive().optional(),
      perHourFrom: z.string().optional(),
    })
    .optional(),
  /** Capability units provided per running hour (Wh for power), or from a question's answer. */
  outputPerHour: z.union([z.number().positive(), FromQuestion]).optional(),
  /** Capability units provided per day without fuel (Wh for power: a solar array). */
  providesPerDay: z.number().positive().optional(),
  /** `providesPerDay` scaled by a numeric answer: answer x `factor`. */
  providesPerDayFrom: z
    .strictObject({ question: z.string(), factor: z.number().positive() })
    .optional(),
  /** Holds charge: the answer x `perUnitWh` (default 1) x `usableFraction`, in Wh. */
  storesWh: z
    .strictObject({
      fromQuestion: z.string(),
      usableFraction: z.number().gt(0).max(1),
      perUnitWh: z.number().positive().optional(),
    })
    .optional(),
  /** Holds a stock of `store` (a water butt holds raw water): the answer x `factor` (default 1). */
  holds: z
    .strictObject({
      store: StoreIdSchema,
      fromQuestion: z.string(),
      factor: z.number().positive().optional(),
    })
    .optional(),
  /** Why the numbers are what they are. */
  note: z.string().optional(),
});
export type Contribution = z.infer<typeof ContributionSchema>;

export const MaintenanceItemSchema = z.strictObject({
  /** Local to the asset type: `maintenance` in the document is keyed by it. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  text: Text,
  everyMonths: z.number().int().min(1),
});
export type MaintenanceItem = z.infer<typeof MaintenanceItemSchema>;

export const AssetTypeSchema = z.strictObject({
  id: NamespacedId,
  name: Text,
  category: CategorySchema,
  questions: z.array(QuestionSchema),
  contributes: z.array(ContributionSchema),
  maintenance: z.array(MaintenanceItemSchema),
});
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const AssetsPackSchema = z.strictObject({
  ...packBase,
  kind: z.literal('assets'),
  assets: z.array(AssetTypeSchema),
});

// ---- guidance ----

export const RuleSchema = z
  .strictObject({
    id: NamespacedId,
    capability: CapabilityIdSchema,
    text: Text,
    /**
     * Per person per day. With `ageBands` the amount is that of the band the person's age falls in
     * and a person in no band needs none.
     */
    perPersonDay: z
      .strictObject({
        store: StoreIdSchema,
        amount: z.number().min(0),
        ageBands: z.array(AgeBand.extend({ amount: z.number().min(0) })).optional(),
      })
      .optional(),
    perPetDay: z
      .strictObject({
        store: StoreIdSchema,
        amount: z.number().min(0),
        bySize: z.strictObject({ S: z.number(), M: z.number(), L: z.number() }).optional(),
      })
      .optional(),
    perHouseholdDay: z.strictObject({ store: StoreIdSchema, amount: z.number().min(0) }).optional(),
    /** Hours of the capability per day for the household (heat), met by assets' `converts`. */
    hoursPerDay: z.number().positive().optional(),
    /** Hot meals per person per day (cooking), met by assets' `converts`. */
    mealsPerPersonDay: z.number().positive().optional(),
    /** A distance to be able to cover (mobility). */
    rangeKm: z.number().positive().optional(),
    /** The rule counts only for people with this tag, or only in households with this risk. */
    appliesTo: z
      .strictObject({ tag: RiskTagSchema.optional(), risk: LocalRiskSchema.optional() })
      .optional(),
    /** e.g. food needs cooking unless it is cold-eatable. */
    requires: z.strictObject({ capability: CapabilityIdSchema }).optional(),
    multipliers: z
      .array(
        z
          .strictObject({
            tag: RiskTagSchema.optional(),
            risk: LocalRiskSchema.optional(),
            insulation: InsulationSchema.optional(),
            factor: z.number().positive(),
          })
          .refine(
            (m) => [m.tag, m.risk, m.insulation].filter((x) => x !== undefined).length === 1,
            {
              message: 'a multiplier names exactly one of tag, risk, insulation',
            },
          ),
      )
      .optional(),
    minHorizonDays: z.number().int().min(1).optional(),
    /** A URL (also listed in the pack's `sources`, with the date checked) or `"assumption"`. */
    source: z.union([Url, z.literal('assumption')]),
  })
  .refine(
    (r) =>
      [
        r.perPersonDay,
        r.perPetDay,
        r.perHouseholdDay,
        r.hoursPerDay,
        r.mealsPerPersonDay,
        r.rangeKm,
      ].some((x) => x !== undefined),
    {
      message:
        'a rule needs a quantity (perPersonDay, perPetDay, perHouseholdDay, hoursPerDay, mealsPerPersonDay or rangeKm)',
    },
  );
export type Rule = z.infer<typeof RuleSchema>;

export const GuidancePackSchema = z.strictObject({
  ...packBase,
  kind: z.literal('guidance'),
  /** The horizons (days) this guidance speaks to, ascending. Empty for region-less rules. */
  horizonBands: z.array(z.number().int().min(1)),
  rules: z.array(RuleSchema),
});

// ---- plans ----

export const PlanDefSchema = z.strictObject({
  id: NamespacedId,
  text: Text,
  capability: CapabilityIdSchema,
  expiresMonths: z.number().int().min(1).optional(),
  /** Shown only when the household has the risk, or owns one of the asset types. */
  requires: z
    .strictObject({
      risk: LocalRiskSchema.optional(),
      asset: z.array(NamespacedId).optional(),
      pets: z.boolean().optional(),
    })
    .optional(),
});
export type PlanDef = z.infer<typeof PlanDefSchema>;

export const PlansPackSchema = z.strictObject({
  ...packBase,
  kind: z.literal('plans'),
  items: z.array(PlanDefSchema),
});

// ---- regions ----

const RiskLink = z.strictObject({ risk: LocalRiskSchema, label: Text, url: Url });
export const RegionDefSchema = z.strictObject({
  id: RegionSchema,
  units: z.strictObject({ volume: z.enum(['L', 'gal']), temperature: z.enum(['C', 'F']) }),
  currency: z.enum(['GBP', 'USD']),
  riskLinks: z.array(RiskLink),
  subregions: z
    .array(z.strictObject({ id: Text, name: Text, riskLinks: z.array(RiskLink) }))
    .optional(),
  suggestedPacks: z.array(z.string()),
});
export type RegionDef = z.infer<typeof RegionDefSchema>;

export const RegionsPackSchema = z.strictObject({
  ...packBase,
  kind: z.literal('regions'),
  regions: z.array(RegionDefSchema),
});

export const PackSchema = z.discriminatedUnion('kind', [
  ItemsPackSchema,
  AssetsPackSchema,
  GuidancePackSchema,
  PlansPackSchema,
  RegionsPackSchema,
]);
export type Pack = z.infer<typeof PackSchema>;
export type PackKind = Pack['kind'];
export type ItemsPack = z.infer<typeof ItemsPackSchema>;
export type AssetsPack = z.infer<typeof AssetsPackSchema>;
export type GuidancePack = z.infer<typeof GuidancePackSchema>;
export type PlansPack = z.infer<typeof PlansPackSchema>;
export type RegionsPack = z.infer<typeof RegionsPackSchema>;

/**
 * The loaded packs, indexed for lookup: things from every loaded pack, enabled or not. The type
 * lives here, in the model, so the engine can name it; `src/packs/loader.ts` builds one
 * (`loadPacks`) and re-exports the type.
 */
export interface Packs {
  all: readonly Pack[];
  byId: Readonly<Record<string, Pack>>;
  items: Readonly<Record<string, ItemType>>;
  assets: Readonly<Record<string, AssetType>>;
  rules: Readonly<Record<string, Rule>>;
  plans: Readonly<Record<string, PlanDef>>;
  regions: Readonly<Partial<Record<Region, RegionDef>>>;
  /**
   * The packs a household uses: those in `settings.packs` (in that order), minus any whose
   * `region` is not `settings.region`. Unknown ids are skipped.
   */
  enabledPacks(settings: Pick<Settings, 'packs' | 'region'>): Pack[];
}
