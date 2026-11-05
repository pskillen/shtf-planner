import type { Settings } from '../model';

/**
 * How near a best-before month is. Nothing reads the clock: the caller passes today as ISO text.
 *
 * - `expired`: the best-before month has gone (a `YYYY-MM` best-before is good to the end of
 *   that month, which is also when the engine stops counting the stock).
 * - `soon`: this month, up to `soonMonths` months ahead.
 * - `check`: later than that, up to `checkMonths` months ahead (before the next stock check).
 * - `ok`: later still.
 */
export type ExpiryLevel = 'expired' | 'soon' | 'check' | 'ok';

export interface ExpiryWindows {
  soonMonths: number;
  checkMonths: number;
}

/** What the household gets until it changes the two settings. */
export const DEFAULT_EXPIRY: ExpiryWindows = { soonMonths: 1, checkMonths: 3 };

/** The windows from the settings; a setting that is absent means its default. */
export function expiryWindows(
  settings: Pick<Settings, 'expirySoonMonths' | 'expiryCheckMonths'>,
): ExpiryWindows {
  return {
    soonMonths: settings.expirySoonMonths ?? DEFAULT_EXPIRY.soonMonths,
    checkMonths: settings.expiryCheckMonths ?? DEFAULT_EXPIRY.checkMonths,
  };
}

const monthIndex = (ym: string): number => {
  const m = /^(\d{4})-(\d{2})/.exec(ym);
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : NaN;
};

/** The level of a `YYYY-MM` best-before on the day `todayIso` (`YYYY-MM-DD`). */
export function expiryLevel(
  bestBefore: string,
  todayIso: string,
  w: ExpiryWindows = DEFAULT_EXPIRY,
): ExpiryLevel {
  const ahead = monthIndex(bestBefore) - monthIndex(todayIso);
  if (Number.isNaN(ahead)) return 'ok';
  if (ahead < 0) return 'expired';
  if (ahead <= w.soonMonths) return 'soon';
  if (ahead <= w.checkMonths) return 'check';
  return 'ok';
}
