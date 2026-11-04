import type {
  CapabilityId,
  Category,
  Condition,
  Cooking,
  Heating,
  HomeType,
  Insulation,
  LocalRisk,
  RiskTag,
} from '../model';

/** Plain-language names for the document's enums. Screens show these, never the raw ids. */

export const RISK_TAG_LABEL: Record<RiskTag, string> = {
  infant: 'Infant',
  child: 'Child',
  pregnant: 'Pregnant',
  elderly: 'Elderly',
  'reduced-mobility': 'Reduced mobility',
  'hearing-or-sight': 'Hearing or sight',
  dietary: 'Special diet',
  'powered-equipment': 'Powered equipment',
  'takes-medication': 'Takes medication',
};

export const LOCAL_RISK_LABEL: Record<LocalRisk, string> = {
  flood: 'Flooding',
  coastal: 'Coastal surge',
  storm: 'Storms',
  snow: 'Snow and ice',
  heat: 'Heatwaves',
  wildfire: 'Wildfire',
  grid: 'Power cuts',
  'water-supply': 'Water supply failure',
  remote: 'Remote location',
  unrest: 'Civil unrest',
  pandemic: 'Pandemic',
};

export const CONDITION_LABEL: Record<Condition, string> = {
  frost: 'Freezes',
  heat: 'Gets hot',
  damp: 'Damp',
  'indoor-stable': 'Indoor and stable',
};

export const HOME_TYPE_LABEL: Record<HomeType, string> = {
  flat: 'Flat',
  terrace: 'Terraced house',
  semi: 'Semi-detached house',
  detached: 'Detached house',
  bungalow: 'Bungalow',
  other: 'Something else',
};

export const HEATING_LABEL: Record<Heating, string> = {
  'gas-boiler': 'Gas boiler',
  'oil-boiler': 'Oil boiler',
  electric: 'Electric heaters',
  'heat-pump': 'Heat pump',
  'wood-burner': 'Wood burner',
  lpg: 'Bottled gas',
  other: 'Something else',
};

export const COOKING_LABEL: Record<Cooking, string> = {
  gas: 'Gas hob',
  electric: 'Electric hob',
  induction: 'Induction hob',
  lpg: 'Bottled gas',
  other: 'Something else',
};

export const INSULATION_LABEL: Record<Insulation, string> = {
  poor: 'Poor',
  average: 'Average',
  good: 'Good',
  excellent: 'Excellent',
};

export const GROWING_LABEL = { none: 'None', small: 'A little', large: 'A lot' } as const;

export const SIZE_LABEL = { S: 'Small', M: 'Medium', L: 'Large' } as const;

export const SPECIES_LABEL = { dog: 'Dog', cat: 'Cat', other: 'Other' } as const;

export const CAPABILITY_LABEL: Record<CapabilityId, string> = {
  water: 'Water',
  food: 'Food',
  heat: 'Heat',
  cooking: 'Cooking',
  light: 'Light',
  power: 'Power',
  comms: 'Communications',
  sanitation: 'Sanitation',
  medical: 'Medical',
  mobility: 'Getting around',
  plans: 'Plans',
};

/** What an asset type gives, as the phrase "Gives ___: yes". */
export const CAPABILITY_GIVES: Record<CapabilityId, string> = {
  water: 'water',
  food: 'food',
  heat: 'heat in an outage',
  cooking: 'a way to cook in an outage',
  light: 'light',
  power: 'power in an outage',
  comms: 'a way to communicate',
  sanitation: 'sanitation',
  medical: 'medical help',
  mobility: 'a way to get around',
  plans: 'a plan',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  water: 'Water',
  food: 'Food and cooking',
  heat: 'Heat',
  power: 'Power',
  fuel: 'Fuel',
  light: 'Light',
  medical: 'Medical',
  comms: 'Communications',
  tools: 'Tools',
  security: 'Safety and security',
  comfort: 'Comfort',
  baby: 'Baby',
  pets: 'Pets',
  sanitation: 'Sanitation',
};

export const HORIZONS = [3, 7, 14, 28] as const;

/** One sentence per horizon: what that length of time means. */
export const HORIZON_SENTENCE: Record<(typeof HORIZONS)[number], string> = {
  3: '72 hours: what UK Gov suggests everyone keeps.',
  7: 'One week: a step up for a household that wants more margin.',
  14: 'Two weeks: what Ready.gov suggests.',
  28: 'Four weeks: a long-haul plan; much more to store.',
};
