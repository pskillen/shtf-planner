import type { Medication, Member, RiskTag } from '../../model';

/** A medication row counts once it has a name; a blank row is not yet medication. */
export const hasNamedMedication = (medication: readonly Medication[]): boolean =>
  medication.some((x) => x.name.trim() !== '');

/** Every medication row needs a name before the person can be saved. */
export const medicationComplete = (medication: readonly Medication[]): boolean =>
  medication.every((x) => x.name.trim() !== '');

/**
 * `takes-medication` follows the medication list (on while some medicine is named, off when none
 * is) unless the chip was set by hand; then the tags are left as they are.
 */
export function syncMedicationTag(
  tags: readonly RiskTag[],
  medication: readonly Medication[],
  setByHand: boolean,
): RiskTag[] {
  if (setByHand) return [...tags];
  const rest = tags.filter((t) => t !== 'takes-medication');
  return hasNamedMedication(medication) ? [...rest, 'takes-medication'] : rest;
}

/** Whether an existing person's `takes-medication` tag already disagrees with their list. */
export const medicationTagSetByHand = (m: Pick<Member, 'tags' | 'medication'>): boolean =>
  m.tags.includes('takes-medication') !== hasNamedMedication(m.medication);

/** A person as saved: trimmed name, and a `dietary` tag whenever there is a dietary note. */
export function finishMember(m: Member): Member {
  const dietary = m.dietary?.trim() || undefined;
  const tags = dietary && !m.tags.includes('dietary') ? [...m.tags, 'dietary' as const] : m.tags;
  return { ...m, name: m.name.trim(), tags, dietary };
}
