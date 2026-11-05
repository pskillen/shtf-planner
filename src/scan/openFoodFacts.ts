import type { Size } from '../model';
import { parseSize } from '../util';
import { OFF_MAX_LOOKUPS, OFF_TIMEOUT_MS, OFF_WINDOW_MS } from './tunables';

/**
 * Open Food Facts: the one outside service the app talks to, and only with the digits of a
 * barcode the household has not met before. No name, place, photo or household fact is sent;
 * cookies and the referrer are left out. Product photos are never fetched.
 */

export interface OffProduct {
  found: boolean;
  name?: string;
  brand?: string;
  /** OFF's own text, e.g. "24 x 330 ml". */
  quantity?: string;
  /** The pack size, read from the text (a multipack) or `product_quantity` and its unit. */
  size?: Size;
  /** kcal per 100 g, or per 100 ml for a drink (OFF reports both under the same key). */
  kcalPer100?: number;
  /** OFF `categories_tags`, e.g. `en:canned-foods`. */
  categories: string[];
}

export type OffResult = OffProduct | 'offline' | 'busy';

export interface OffClient {
  lookup(code: string): Promise<OffResult>;
}

export interface OffOptions {
  fetch?: typeof fetch;
  now?: () => number;
  /** The identification string (the `User-Agent` OFF asks for). */
  userAgent?: string;
  timeoutMs?: number;
}

/** The only fields asked for. */
export const OFF_FIELDS =
  'product_name,brands,quantity,product_quantity,product_quantity_unit,nutriments,categories_tags';

/**
 * Open Food Facts asks every app for `AppName/Version (contact)`. No email lives in the code: the
 * contact is the site.
 */
export const offIdentification = (version: string): string =>
  `SHTF-Planner/${version} (https://prep.mm9pdy.net)`;

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Zero or more: a diet drink really is 0 kcal. */
const nonNegative = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

function parse(body: unknown): OffProduct {
  const b = (body ?? {}) as { status?: unknown; product?: unknown };
  if (b.status !== 1 || typeof b.product !== 'object' || b.product === null) {
    return { found: false, categories: [] };
  }
  const p = b.product as Record<string, unknown>;
  const text = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  const nutriments = (p.nutriments ?? {}) as Record<string, unknown>;
  const kcal = nonNegative(nutriments['energy-kcal_100g']);
  const quantity = text(p.quantity);
  const size = parseSize(
    quantity,
    num(p.product_quantity),
    typeof p.product_quantity_unit === 'string' ? p.product_quantity_unit : undefined,
  );
  const brand = text(p.brands)?.split(',')[0]?.trim();
  return {
    found: true,
    ...(text(p.product_name) ? { name: text(p.product_name)! } : {}),
    ...(brand ? { brand } : {}),
    ...(quantity ? { quantity } : {}),
    ...(size ? { size } : {}),
    ...(kcal !== undefined ? { kcalPer100: kcal } : {}),
    categories: Array.isArray(p.categories_tags)
      ? p.categories_tags.filter((t): t is string => typeof t === 'string')
      : [],
  };
}

export function offClient(opts: OffOptions = {}): OffClient {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const now = opts.now ?? Date.now;
  const userAgent = opts.userAgent ?? offIdentification('local');
  const timeoutMs = opts.timeoutMs ?? OFF_TIMEOUT_MS;
  /** Start times of the lookups in the rolling window. */
  const sent: number[] = [];

  return {
    async lookup(code) {
      if (globalThis.navigator?.onLine === false) return 'offline';
      const t = now();
      while (sent.length > 0 && t - sent[0]! >= OFF_WINDOW_MS) sent.shift();
      if (sent.length >= OFF_MAX_LOOKUPS) return 'busy';
      sent.push(t);
      try {
        const res = await doFetch(
          `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`,
          {
            headers: { 'User-Agent': userAgent, 'X-User-Agent': userAgent },
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
            signal: AbortSignal.timeout(timeoutMs),
          },
        );
        if (res.status === 429) return 'busy';
        if (res.status === 404) return { found: false, categories: [] };
        if (!res.ok) return 'offline';
        return parse(await res.json());
      } catch {
        return 'offline';
      }
    },
  };
}
