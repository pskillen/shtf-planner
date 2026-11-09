import { z } from 'zod';
import type { Settings } from './document';
import {
  ConditionSchema,
  InsulationSchema,
  IsoDateSchema,
  LocalRiskSchema,
  MEASURES,
  RegionSchema,
  RiskTagSchema,
  SizeSchema,
  type Region,
} from './primitives';

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
export const RESOURCE_INFO = {
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
export type ResourceId = keyof typeof RESOURCE_INFO;
export const RESOURCE_IDS = Object.keys(RESOURCE_INFO) as [ResourceId, ...ResourceId[]];
export const ResourceIdSchema = z.enum(RESOURCE_IDS);

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

/**
 * An age range in months, **half-open**: `[fromMonths, toMonths)`. A child of exactly `toMonths`
 * is *not* in the band; they are in the band that starts there. So `0-6, 6-12, 12-36` is a
 * partition, and a person is in at most one of a rule's bands. (An item's `ageBand` says what ages
 * it suits and may overlap its neighbours', because sizes overlap: nappy size 2 and 3 both fit a
 * five-month-old.)
 */
const bandShape = { fromMonths: Months, toMonths: Months };
const nonEmptyBand = (b: { fromMonths: number; toMonths: number }) => b.fromMonths < b.toMonths;
const NON_EMPTY = { message: 'fromMonths must be below toMonths (the band is [from, to))' };
const AgeBand = z.strictObject(bandShape).refine(nonEmptyBand, NON_EMPTY);
const AmountBand = z
  .strictObject({ ...bandShape, amount: z.number().min(0) })
  .refine(nonEmptyBand, NON_EMPTY);

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

/**
 * What one item gives of a resource: `amount` for every `per` base units (g, ml or pieces) of a
 * product's size. 0 is allowed for food kcal that only a label can say (a soft drink's water).
 */
export const GiveSchema = z.strictObject({
  resource: ResourceIdSchema,
  amount: z.number().min(0),
  per: z.number().positive(),
});
export type Give = z.infer<typeof GiveSchema>;

/**
 * An item: the generic thing ("Baked beans"), from the pack only. It says what it counts towards
 * per unit of size; the household's products (a name, a size, barcodes) count through it.
 */
export const ItemSchema = z.strictObject({
  id: NamespacedId,
  name: Text,
  category: CategorySchema,
  /** The group inside the category ("Tins"); headings and items are listed in aisle order. */
  heading: Text.optional(),
  /** What its sizes are measured in: mass (g, kg), volume (ml, L) or a count of pieces. */
  measure: z.enum(MEASURES),
  /** The word for one pack: "tin", "jar", "bag", "bottle", "pack", "each". */
  unit: Text,
  /** The one line the app shows for it: what it counts towards. */
  countsAs: Text,
  gives: z.array(GiveSchema),
  /** Quick sizes, the usual one first; each in a unit of `measure`. */
  sizes: z.array(SizeSchema),
  /** Conditions it tolerates. `indoor-stable` is always fine. */
  suitability: z.array(ConditionSchema),
  shelfLife: z.enum(['none', 'years', 'year', 'months', 'weeks']),
  ageBand: AgeBand.optional(),
  /** A rough UK price for `sizes[0]`. */
  typicalPricePence: z.number().int().min(0).optional(),
  tags: z.array(z.string()),
  /**
   * Set on a buy-only entry for a piece of equipment: the asset type it is. Equipment is kept
   * under Home, Equipment, never as stock, so the entry is for suggestions ("buy a stove") and
   * its add action opens the equipment form for this type. Stock of such an item counts nothing.
   */
  assetTypeId: NamespacedId.optional(),
  /** Open Food Facts category tags that mean this item (each tag on one item only). */
  offCategories: z.array(z.string().regex(/^[a-z]{2}:[a-z0-9-]+$/)).optional(),
  /**
   * Where a number on this item comes from (its `gives`): an https URL listed in the pack's
   * `sources`, or `"assumption"`.
   */
  source: z.union([Url, z.literal('assumption')]).optional(),
});
export type Item = z.infer<typeof ItemSchema>;

export const ItemsPackSchema = z.strictObject({
  ...packBase,
  kind: z.literal('items'),
  items: z.array(ItemSchema),
});

// ---- assets ----

export const QuestionSchema = z.strictObject({
  /** Local to the asset type: `answers` in the document are keyed by it. */
  id: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/),
  text: Text,
  kind: z.enum(['bool', 'number', 'choice']),
  choices: z.array(Text).optional(),
  unit: z.string().optional(),
  /** Display labels for stable choice values. */
  choiceLabels: z.record(z.string(), Text).optional(),
  /** A choice question that starts unanswered, when no option is a fair first guess. */
  noDefault: z.boolean().optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

const AnswerValue = z.union([z.string(), z.number(), z.boolean()]);
const FromQuestion = z.strictObject({ fromQuestion: z.string() });

export const ContributionSchema = z.strictObject({
  capability: CapabilityIdSchema,
  /** Counts only while the asset's answer to `question` equals `equals`. */
  when: z.strictObject({ question: z.string(), equals: AnswerValue }).optional(),
  /** Burns `resource` while running: `perHour` units per hour, or the answer to a question. */
  converts: z
    .strictObject({
      resource: ResourceIdSchema,
      perHour: z.number().positive().optional(),
      perHourFrom: z.string().optional(),
      rateOverrideQuestion: z.string().optional(),
      fuel: z.strictObject({
        itemIds: z.array(NamespacedId).min(1),
        selectionQuestion: z.string().optional(),
        confirmationQuestion: z.string(),
        indoorQuestion: z.string().optional(),
        highRiseQuestion: z.string().optional(),
      }),
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
  /**
   * Holds charge: the answer x `perUnitWh` x `usableFraction`, in Wh. `perUnitWh` is how many Wh
   * one unit of the answer is (1 for an answer in Wh, 1000 for kWh, 12 for Ah at 12 V). It has no
   * default: say it, so a kWh answer is never read as Wh.
   */
  storesWh: z
    .strictObject({
      fromQuestion: z.string(),
      usableFraction: z.number().gt(0).max(1),
      perUnitWh: z.number().positive(),
    })
    .optional(),
  /** Holds a stock of `resource` (a water butt holds raw water): the answer x `factor` (default 1). */
  holds: z
    .strictObject({
      resource: ResourceIdSchema,
      fromQuestion: z.string(),
      factor: z.number().positive().optional(),
    })
    .optional(),
  /**
   * Where the numbers come from: an https URL (listed in the pack's `sources` with the date
   * checked) or `"assumption"`. Required when the contribution carries a number, as for rules.
   */
  source: z.union([Url, z.literal('assumption')]).optional(),
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
  useContext: z.enum(['outdoor-only', 'potentially-indoor', 'unknown']).optional(),
  guidance: z.array(z.strictObject({ text: Text, source: Url })).optional(),
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
     * (half-open: see `AgeBand`) and a person in no band needs none; the bands must not overlap.
     */
    perPersonDay: z
      .strictObject({
        resource: ResourceIdSchema,
        amount: z.number().min(0),
        ageBands: z
          .array(AmountBand)
          .refine(
            (bands) =>
              bands.every((a, i) =>
                bands.every(
                  (b, j) => i === j || a.toMonths <= b.fromMonths || b.toMonths <= a.fromMonths,
                ),
              ),
            { message: 'age bands must not overlap' },
          )
          .optional(),
      })
      .optional(),
    perPetDay: z
      .strictObject({
        resource: ResourceIdSchema,
        amount: z.number().min(0),
        bySize: z.strictObject({ S: z.number(), M: z.number(), L: z.number() }).optional(),
      })
      .optional(),
    perHouseholdDay: z
      .strictObject({ resource: ResourceIdSchema, amount: z.number().min(0) })
      .optional(),
    /**
     * A fixed amount of `resource` for the household, whatever the horizon: a one-off item (a first
     * aid kit) rather than a daily need. Not multiplied by days.
     */
    perHousehold: z
      .strictObject({ resource: ResourceIdSchema, amount: z.number().positive() })
      .optional(),
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
    /**
     * Every multiplier that matches the household multiplies the amount: poor insulation (x1.5)
     * and a snow risk (x1.5) together make x2.25. A `tag` multiplier matches a person with that
     * tag, a `risk` one a household with that risk, an `insulation` one that insulation level.
     */
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
    /** The rule applies only when the chosen horizon is at least this many days (>=). */
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
        r.perHousehold,
        r.hoursPerDay,
        r.mealsPerPersonDay,
        r.rangeKm,
      ].some((x) => x !== undefined),
    {
      message:
        'a rule needs a quantity (perPersonDay, perPetDay, perHouseholdDay, perHousehold, hoursPerDay, mealsPerPersonDay or rangeKm)',
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

// ---- checklists ----

/** The five checklist headings, in the order a household meets them. */
export const CHECKLIST_PHASES = [
  'coming',
  'immediate',
  'first-days',
  'first-week',
  'longer-term',
] as const;
export const ChecklistPhaseSchema = z.enum(CHECKLIST_PHASES);
export type ChecklistPhase = z.infer<typeof ChecklistPhaseSchema>;

/** A thing that can happen ("Power cut", "Flood warning"); its steps name it in `scenarios`. */
export const ChecklistScenarioSchema = z.strictObject({
  id: NamespacedId,
  name: Text,
  /** The local risks that make this scenario worth showing. */
  risks: z.array(LocalRiskSchema).optional(),
});
export type ChecklistScenario = z.infer<typeof ChecklistScenarioSchema>;

export const ChecklistStepSchema = z.strictObject({
  id: NamespacedId,
  text: Text,
  /** The scenarios this step belongs to: at least one, no repeats, all in the same pack. */
  scenarios: z
    .array(NamespacedId)
    .min(1)
    .refine((a) => new Set(a).size === a.length, { message: 'scenarios must not repeat' }),
  phase: ChecklistPhaseSchema,
  /** Position inside its phase. */
  order: z.number().int(),
  /** Shown only when the household has the risk, one of the asset types, pets, or a person with the tag. */
  requires: z
    .strictObject({
      risk: LocalRiskSchema.optional(),
      asset: z.array(NamespacedId).optional(),
      pets: z.boolean().optional(),
      memberTag: RiskTagSchema.optional(),
    })
    .optional(),
  /** An https URL listed in the pack's `sources`, or `"assumption"`. */
  source: z.union([Url, z.literal('assumption')]),
});
export type ChecklistStep = z.infer<typeof ChecklistStepSchema>;

export const ChecklistsPackSchema = z.strictObject({
  ...packBase,
  kind: z.literal('checklists'),
  scenarios: z.array(ChecklistScenarioSchema),
  steps: z.array(ChecklistStepSchema),
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
  ChecklistsPackSchema,
  RegionsPackSchema,
]);
export type Pack = z.infer<typeof PackSchema>;
export type PackKind = Pack['kind'];
export type ItemsPack = z.infer<typeof ItemsPackSchema>;
export type AssetsPack = z.infer<typeof AssetsPackSchema>;
export type GuidancePack = z.infer<typeof GuidancePackSchema>;
export type PlansPack = z.infer<typeof PlansPackSchema>;
export type ChecklistsPack = z.infer<typeof ChecklistsPackSchema>;
export type RegionsPack = z.infer<typeof RegionsPackSchema>;

/**
 * The loaded packs, indexed for lookup: things from every loaded pack, enabled or not. The type
 * lives here, in the model, so the engine can name it; `src/packs/loader.ts` builds one
 * (`loadPacks`) and re-exports the type.
 */
export interface Packs {
  all: readonly Pack[];
  byId: Readonly<Record<string, Pack>>;
  items: Readonly<Record<string, Item>>;
  assets: Readonly<Record<string, AssetType>>;
  rules: Readonly<Record<string, Rule>>;
  plans: Readonly<Record<string, PlanDef>>;
  checklistScenarios: Readonly<Record<string, ChecklistScenario>>;
  checklistSteps: Readonly<Record<string, ChecklistStep>>;
  regions: Readonly<Partial<Record<Region, RegionDef>>>;
  /**
   * The packs a household uses: those in `settings.packs` (in that order), minus any whose
   * `region` is not `settings.region`. Unknown ids are skipped.
   */
  enabledPacks(settings: Pick<Settings, 'packs' | 'region'>): Pack[];
}
