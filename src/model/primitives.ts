import { z } from 'zod';

/** Small shared schemas that both the document and the packs use (so neither imports the other). */

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const REGIONS = ['UK', 'US'] as const;
export const RegionSchema = z.enum(REGIONS);
export type Region = z.infer<typeof RegionSchema>;

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

export const LocalRiskSchema = z.enum(LOCAL_RISKS);

export type LocalRisk = z.infer<typeof LocalRiskSchema>;

export const INSULATIONS = ['poor', 'average', 'good', 'excellent'] as const;

export const InsulationSchema = z.enum(INSULATIONS);

export type Insulation = z.infer<typeof InsulationSchema>;

export const CONDITIONS = ['frost', 'heat', 'damp', 'indoor-stable'] as const;
export const ConditionSchema = z.enum(CONDITIONS);
export type Condition = z.infer<typeof ConditionSchema>;

export const SIZE_UNITS = ['g', 'kg', 'ml', 'L', 'pieces'] as const;
export const SizeUnitSchema = z.enum(SIZE_UNITS);
export type SizeUnit = z.infer<typeof SizeUnitSchema>;
/** A pack size: `amount unit`, or a multipack of `count` such packs ("24 × 500 ml"); the total counts. */
export const SizeSchema = z.strictObject({
  count: z.number().int().min(2).optional(),
  amount: z.number().positive(),
  unit: SizeUnitSchema,
});
export type Size = z.infer<typeof SizeSchema>;
export const MEASURES = ['mass', 'volume', 'count'] as const;
export type Measure = (typeof MEASURES)[number];
/** The units a measure's sizes may use; its base unit is g, ml or pieces. */
export const MEASURE_UNITS: Record<Measure, readonly SizeUnit[]> = {
  mass: ['g', 'kg'],
  volume: ['ml', 'L'],
  count: ['pieces'],
};
