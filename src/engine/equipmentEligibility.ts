import type { AssetType, Contribution } from '../model';

export type EquipmentReason =
  | 'operating-mode'
  | 'fuel-selection'
  | 'fuel-confirmation'
  | 'indoor-use'
  | 'high-rise'
  | 'rate'
  | 'output';
export type EquipmentAnswers = Record<string, string | number | boolean>;

/** Eligibility is based on explicit household checks, never inferred from a fuel grade. */
export function equipmentEligibility(
  type: AssetType,
  contribution: Contribution,
  answers: EquipmentAnswers,
): { itemId?: string; perHour?: number; output?: number; reasons: EquipmentReason[] } {
  const c = contribution.converts;
  if (!c) return { reasons: [] };
  const reasons: EquipmentReason[] = [];
  const selected = c.fuel.selectionQuestion ? answers[c.fuel.selectionQuestion] : c.fuel.itemIds[0];
  const itemId =
    typeof selected === 'string' && c.fuel.itemIds.includes(selected) ? selected : undefined;
  if (!itemId) reasons.push('fuel-selection');
  if (answers[c.fuel.confirmationQuestion] !== true) reasons.push('fuel-confirmation');
  if (c.fuel.indoorQuestion && answers[c.fuel.indoorQuestion] !== 'permitted')
    reasons.push('indoor-use');
  if (c.fuel.highRiseQuestion && answers[c.fuel.highRiseQuestion] !== 'no')
    reasons.push('high-rise');
  if (
    (!type.useContext || (type.useContext === 'unknown' && !c.fuel.indoorQuestion)) &&
    contribution.capability === 'heat'
  )
    reasons.push('indoor-use');
  if (type.useContext === 'outdoor-only' && contribution.capability === 'heat')
    reasons.push('indoor-use');
  const number = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
  const override = c.rateOverrideQuestion ? answers[c.rateOverrideQuestion] : undefined;
  const perHour =
    override === undefined
      ? (c.perHour ?? number(c.perHourFrom ? answers[c.perHourFrom] : undefined))
      : number(override);
  if (!perHour) reasons.push('rate');
  const output =
    contribution.outputPerHour === undefined
      ? 1
      : typeof contribution.outputPerHour === 'number'
        ? number(contribution.outputPerHour)
        : number(answers[contribution.outputPerHour.fromQuestion]);
  if (!output) reasons.push('output');
  return {
    ...(itemId ? { itemId } : {}),
    ...(perHour ? { perHour } : {}),
    ...(output ? { output } : {}),
    reasons,
  };
}
