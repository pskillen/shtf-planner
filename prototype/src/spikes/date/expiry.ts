// How soon a date expires, as a colour AND a word (never colour alone). Month level: a MM/YYYY date is good to the end of that month.
//   expired        before this month                        red
//   expires soon   this month .. `soonMonths` ahead         red   (setting, default 1 month)
//   check before   up to `checkMonths` ahead                amber (setting "next check in", default 3 months; P8's review cadence will set it)
//   ok             later                                    normal
import { el } from '../../ui';
import { type MonthYear } from './parse.ts';
import { load, save } from './read-loop.ts';

export type ExpiryLevel = 'expired' | 'soon' | 'check' | 'ok';
export type ExpiryLook = { level: ExpiryLevel; word: string; fg: string; bg: string };

const KEY = 'date-spike-expiry';
export const expirySettings = { soonMonths: 1, checkMonths: 3, ...load<{ soonMonths?: number; checkMonths?: number }>(KEY, {}) };

const LOOKS: Record<ExpiryLevel, Omit<ExpiryLook, 'level'>> = {
  expired: { word: 'EXPIRED', fg: '#fff', bg: '#c0262d' },
  soon: { word: 'EXPIRES SOON', fg: '#fff', bg: '#c0262d' },
  check: { word: 'EXPIRES BEFORE NEXT CHECK', fg: '#2a1700', bg: '#f2b84b' },
  ok: { word: 'OK', fg: '#052', bg: '#cfeadb' },
};

export function expiryLevel(v: MonthYear, now: Date = new Date()): ExpiryLevel {
  const ahead = v.year * 12 + (v.month - 1) - (now.getFullYear() * 12 + now.getMonth());
  if (ahead < 0) return 'expired';
  if (ahead <= expirySettings.soonMonths) return 'soon';
  if (ahead <= expirySettings.checkMonths) return 'check';
  return 'ok';
}
export function expiryLook(v: MonthYear, now?: Date): ExpiryLook {
  const level = expiryLevel(v, now);
  return { level, ...LOOKS[level] };
}

/** A pill with the word, in the colour. */
export function expiryBadge(v: MonthYear, now?: Date) {
  const l = expiryLook(v, now);
  const b = el('span', { textContent: l.word });
  b.style.cssText = `display:inline-block;font-size:13px;font-weight:700;border-radius:6px;padding:1px 8px;background:${l.bg};color:${l.fg};`;
  return b;
}

/** Two small selects for the settings, folded away so the screen keeps its room. */
export function expirySettingsEl() {
  const d = el('details');
  d.style.cssText = 'font-size:13px;margin:2px 0;';
  d.append(el('summary', { textContent: 'Expiry colours: soon within ' + expirySettings.soonMonths + ' mo, next check in ' + expirySettings.checkMonths + ' mo' }));
  const mk = (label: string, key: 'soonMonths' | 'checkMonths', opts: number[]) => {
    const s = el('select');
    for (const n of opts) s.append(new Option(`${n} month${n === 1 ? '' : 's'}`, String(n)));
    s.value = String(expirySettings[key]);
    s.onchange = () => { expirySettings[key] = +s.value; save(KEY, { soonMonths: expirySettings.soonMonths, checkMonths: expirySettings.checkMonths }); };
    s.style.cssText = 'font-size:14px;padding:4px;margin:0 8px 0 4px;';
    return el('label', {}, label, s);
  };
  d.append(mk('Expires soon within', 'soonMonths', [0, 1, 2, 3]), mk('Next check in', 'checkMonths', [1, 2, 3, 6, 12]));
  return d;
}
