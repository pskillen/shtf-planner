/**
 * The numbers the engine itself uses, beyond the ones in the packs. Each is an assumption (no
 * source gives it), listed here so they can be sanity-checked in one place; `docs/features/engine`
 * and the PR description repeat the list. Pack numbers are read with `grep '"assumption"'`.
 */
export interface EngineAssumption {
  id: string;
  value: number;
  unit: string;
  text: string;
}

export const ASSUMPTIONS = {
  cookingHoursPerPersonMeal: {
    id: 'cookingHoursPerPersonMeal',
    value: 0.25,
    unit: 'burner-hours per person per hot meal',
    text: 'A hot meal takes about a quarter of an hour of burner time per person served. The cooking rule says how many meals; this turns meals into running hours.',
  },
  evKmPerKwh: {
    id: 'evKmPerKwh',
    value: 4,
    unit: 'km per kWh',
    text: 'An electric car drives about 4 km on each kWh in cold weather.',
  },
  evChargeFraction: {
    id: 'evChargeFraction',
    value: 0.5,
    unit: 'of the battery',
    text: 'On an ordinary day a car is about half charged, so half the battery counts towards driving range.',
  },
  petrolKmPerL: {
    id: 'petrolKmPerL',
    value: 12,
    unit: 'km per litre',
    text: 'Petrol in cans or the tank drives about 12 km a litre (roughly 8 L per 100 km).',
  },
  radiosPerHousehold: {
    id: 'radiosPerHousehold',
    value: 1,
    unit: 'radio',
    text: 'One radio that works without mains power or a phone signal.',
  },
} as const satisfies Record<string, EngineAssumption>;

/** How much a suggestion may overshoot the shortfall before a smaller unit is preferred. */
export const MAX_OVERSHOOT = 3;

/** The horizons the app offers, ascending. */
export const HORIZONS = [3, 7, 14, 28] as const;
