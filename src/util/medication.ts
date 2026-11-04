/**
 * Days a supply lasts: units on hand divided by units taken per day. `undefined` when no dose is
 * set (nothing to divide by). Whole days, rounded down: half a day is not a day you can count on.
 */
export function daysOfSupply(unitsOnHand: number, dosePerDay: number): number | undefined {
  if (!(dosePerDay > 0)) return undefined;
  return Math.floor(unitsOnHand / dosePerDay);
}
