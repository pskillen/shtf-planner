import { afterEach, describe, expect, it, vi } from 'vitest';
import { OFF_FIELDS, offClient, offIdentification } from './openFoodFacts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const nutella = {
  status: 1,
  product: {
    product_name: 'Test spread',
    brands: 'Acme, Other',
    quantity: '400 g',
    product_quantity: '400',
    product_quantity_unit: 'g',
    nutriments: { 'energy-kcal_100g': 539 },
    categories_tags: ['en:spreads', 'en:canned-foods'],
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('the Open Food Facts client', () => {
  it('parses a found product: name, brand, size and energy', async () => {
    const fetch = vi.fn(async () => json(nutella));
    const r = await offClient({ fetch }).lookup('3017620422003');
    expect(r).toEqual({
      found: true,
      name: 'Test spread',
      brand: 'Acme',
      quantity: '400 g',
      grams: 400,
      kcalPer100g: 539,
      categories: ['en:spreads', 'en:canned-foods'],
    });
  });

  it('reads volumes and kilograms', async () => {
    const make = (q: string, unit: string) =>
      offClient({
        fetch: async () =>
          json({ status: 1, product: { product_quantity: q, product_quantity_unit: unit } }),
      }).lookup('3017620422003');
    expect(await make('1.5', 'l')).toMatchObject({ ml: 1500 });
    expect(await make('500', 'ml')).toMatchObject({ ml: 500 });
    expect(await make('2', 'kg')).toMatchObject({ grams: 2000 });
  });

  it('says not found for status 0 and for a 404', async () => {
    expect(
      await offClient({ fetch: async () => json({ status: 0 }) }).lookup('5000169005743'),
    ).toEqual({
      found: false,
      categories: [],
    });
    expect(
      await offClient({ fetch: async () => json({ status: 0 }, 404) }).lookup('5000169005743'),
    ).toEqual({ found: false, categories: [] });
  });

  it('says offline on a network failure, a server error or navigator.onLine false', async () => {
    expect(
      await offClient({
        fetch: async () => {
          throw new TypeError('Failed to fetch');
        },
      }).lookup('3017620422003'),
    ).toBe('offline');
    expect(await offClient({ fetch: async () => json({}, 500) }).lookup('3017620422003')).toBe(
      'offline',
    );
    vi.stubGlobal('navigator', { onLine: false });
    const fetch = vi.fn();
    expect(await offClient({ fetch }).lookup('3017620422003')).toBe('offline');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says busy on a 429', async () => {
    expect(await offClient({ fetch: async () => json({}, 429) }).lookup('3017620422003')).toBe(
      'busy',
    );
  });

  it('keeps to ten lookups in any rolling minute', async () => {
    let t = 1_000_000;
    const fetch = vi.fn(async () => json({ status: 0 }));
    const c = offClient({ fetch, now: () => t });
    for (let i = 0; i < 10; i++) {
      expect(await c.lookup('3017620422003')).toMatchObject({ found: false });
      t += 1000;
    }
    expect(await c.lookup('3017620422003')).toBe('busy');
    expect(fetch).toHaveBeenCalledTimes(10);
    t = 1_000_000 + 60_000; // the first has left the window
    expect(await c.lookup('3017620422003')).toMatchObject({ found: false });
    expect(await c.lookup('3017620422003')).toBe('busy');
  });

  it('sends only the digits and the field list, with the identification and no cookies or referrer', async () => {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
      json({ status: 0 }),
    );
    await offClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      userAgent: offIdentification('1.2.3'),
    }).lookup('3017620422003');
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(
      `https://world.openfoodfacts.org/api/v2/product/3017620422003.json?fields=${OFF_FIELDS}`,
    );
    expect(init).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      headers: {
        'User-Agent': 'SHTF-Planner/1.2.3 (https://prep.mm9pdy.net)',
        'X-User-Agent': 'SHTF-Planner/1.2.3 (https://prep.mm9pdy.net)',
      },
    });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
  });
});
