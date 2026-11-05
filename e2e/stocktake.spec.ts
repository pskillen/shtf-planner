import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installFakeCamera, type FakeCam, type FakeCameraOptions } from './fakeCamera';

type Item = {
  id: string;
  typeId: string;
  qty: number;
  locationId: string;
  bestBefore?: string;
  source: string;
};
type Doc = {
  items: Record<string, Item>;
  barcodes: Record<string, { typeId: string; name?: string }>;
  scans: Record<string, { code: string; product?: { found: boolean; name?: string } }>;
};
type Shtf = {
  doc: () => Promise<Doc>;
  loadFixture: () => Promise<void>;
  flush: () => Promise<void>;
};

const doc = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.doc());
const cam = <K extends keyof FakeCam>(page: Page, method: K, arg?: unknown) =>
  page.evaluate(
    ([m, a]) =>
      (window as unknown as { __fakeCam: Record<string, (x?: unknown) => void> }).__fakeCam[
        m as string
      ]!(a),
    [method, arg] as const,
  );
const show = (page: Page, ean: string, sideways = false) => cam(page, 'show', { ean, sideways });

const KNOWN = '3017620422003'; // in the fixture: Peanut butter (340 g jar), "Test spread 400 g"
const BEANS = '5000169005743'; // Open Food Facts (faked): baked beans, 415 g
const NOT_FOUND = '4006381333931'; // Open Food Facts (faked): 404

/** A recorded-shape answer for the product API; a 404 for anything else. */
const offAnswers = (code: string): { status: number; body: unknown } =>
  code === BEANS
    ? {
        status: 200,
        body: {
          status: 1,
          product: {
            product_name: 'Test beans',
            brands: 'Acme',
            quantity: '415 g',
            product_quantity: '415',
            product_quantity_unit: 'g',
            nutriments: { 'energy-kcal_100g': 80 },
            categories_tags: ['en:canned-foods', 'en:baked-beans'],
          },
        },
      }
    : { status: 404, body: { status: 0 } };

interface Net {
  offUrls: string[];
  offHeaders: Array<Record<string, string>>;
  hosts: Set<string>;
  offline: boolean;
}

async function setUp(
  page: Page,
  context: BrowserContext,
  camera: FakeCameraOptions = { capabilities: 'chrome', detector: true },
): Promise<Net> {
  const net: Net = { offUrls: [], offHeaders: [], hosts: new Set(), offline: false };
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'http:' || u.protocol === 'https:') net.hosts.add(u.host);
  });
  await installFakeCamera(page, camera);
  await context.route('https://world.openfoodfacts.org/**', async (route) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors });
    if (net.offline) return route.abort('internetdisconnected');
    net.offUrls.push(route.request().url());
    net.offHeaders.push(route.request().headers());
    const code = /product\/(\d+)\.json/.exec(route.request().url())?.[1] ?? '';
    const a = offAnswers(code);
    return route.fulfill({
      status: a.status,
      headers: cors,
      contentType: 'application/json',
      body: JSON.stringify(a.body),
    });
  });
  await page.goto('/?debug=1');
  await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.loadFixture());
  return net;
}

const open = (page: Page, path: string) => page.goto(`${path}?debug=1`);
const dateCard = (page: Page, name: string) => page.getByRole('heading', { name, exact: true });
/** The first quick best-before choice (its label depends on how long the type keeps). */
const firstChip = (page: Page) =>
  page
    .getByRole('group', { name: /quick choices/ })
    .getByRole('button')
    .first()
    .click();
const ok = (page: Page) => page.getByRole('button', { name: 'OK', exact: true }).click();

async function countTin(page: Page, ean: string, name: string): Promise<void> {
  await show(page, ean);
  await expect(dateCard(page, name)).toBeVisible();
  await cam(page, 'clear');
  await firstChip(page);
  await ok(page);
  await expect(page.getByText('1 BARCODE')).toBeVisible();
}

test.describe('stocktake with a fake camera', () => {
  test('three tins: a known barcode, a new one, and the same new one again', async ({
    page,
    context,
  }) => {
    const net = await setUp(page, context);
    await open(page, '/app/stores/stocktake');
    await page.getByLabel('Counting into').selectOption({ label: 'Pantry' });

    // 1. A barcode the household already knows: straight to the date.
    await countTin(page, KNOWN, 'Peanut butter (340 g jar)');
    expect(net.offUrls).toHaveLength(0);

    // 2. A new one: Open Food Facts says what it is, the person picks, the app remembers.
    await show(page, BEANS);
    await expect(page.getByText('Open Food Facts says:')).toBeVisible();
    await expect(page.getByText('Test beans 415 g')).toBeVisible();
    await cam(page, 'clear');
    await page.getByRole('button', { name: /Tinned food \(400 g tin\)/ }).click();
    await expect(dateCard(page, 'Tinned food (400 g tin)')).toBeVisible();
    await firstChip(page);
    await ok(page);
    await expect(page.getByText('1 BARCODE')).toBeVisible();
    expect(net.offUrls).toHaveLength(1);

    // 3. The same one again: remembered, so it goes straight to the date and asks nothing.
    await countTin(page, BEANS, 'Tinned food (400 g tin)');
    expect(net.offUrls).toHaveLength(1);

    const d = await doc(page);
    const barcode = Object.values(d.items).filter((i) => i.source === 'barcode');
    const peanut = barcode.find((i) => i.typeId === 'items-base:peanut-butter-340g');
    const tins = barcode.find((i) => i.typeId === 'items-base:tinned-food-tin');
    expect(peanut).toMatchObject({ qty: 1, locationId: 'loc-pantry' });
    expect(peanut!.bestBefore).toMatch(/^\d{4}-\d{2}$/);
    expect(tins).toMatchObject({ qty: 2, locationId: 'loc-pantry' });
    expect(d.barcodes[BEANS]).toMatchObject({
      typeId: 'items-base:tinned-food-tin',
      name: 'Test beans 415 g',
    });
    expect(Object.keys(d.scans)).toHaveLength(0);
  });

  test('Undo after OK removes exactly that addition', async ({ page, context }) => {
    await setUp(page, context);
    await open(page, '/app/stores/stocktake');
    const before = await doc(page);
    await show(page, KNOWN);
    await expect(dateCard(page, 'Peanut butter (340 g jar)')).toBeVisible();
    await cam(page, 'clear');
    await firstChip(page);
    await ok(page);
    await expect(page.getByTestId('stocktake-saved')).toContainText(
      'Saved 1 × Peanut butter (340 g jar)',
    );
    expect(Object.keys((await doc(page)).items)).toHaveLength(Object.keys(before.items).length + 1);
    await page.getByTestId('stocktake-saved').getByRole('button', { name: 'Undo' }).click();
    expect((await doc(page)).items).toEqual(before.items);
    await expect(dateCard(page, 'Peanut butter (340 g jar)')).toBeVisible();
  });

  test('offline: sort later, then the name appears when back online and it can be sorted', async ({
    page,
    context,
  }) => {
    const net = await setUp(page, context);
    await open(page, '/app/stores/stocktake');
    net.offline = true;
    await context.setOffline(true);

    await show(page, BEANS);
    await expect(page.getByText(/You are offline/)).toBeVisible();
    await cam(page, 'clear');
    await page.getByRole('button', { name: 'Sort later' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('stocktake-summary')).toContainText('1 to sort later');
    await page.getByRole('button', { name: 'Back to Stores' }).click();
    await expect(page.getByRole('button', { name: '1 scan to sort ›' })).toBeVisible();
    expect(net.offUrls).toHaveLength(0);

    net.offline = false;
    await context.setOffline(false);
    await page.getByRole('button', { name: '1 scan to sort ›' }).click();
    await expect(page.getByText('Test beans 415 g')).toBeVisible();

    await page.getByRole('button', { name: `Sort scan ${BEANS}` }).click();
    await page.getByRole('button', { name: /Tinned food \(400 g tin\)/ }).click();
    const d = await doc(page);
    expect(Object.keys(d.scans)).toHaveLength(0);
    expect(
      Object.values(d.items).find(
        (i) => i.typeId === 'items-base:tinned-food-tin' && i.source === 'barcode',
      ),
    ).toMatchObject({ qty: 1 });
  });

  test('Firefox-like: no torch or zoom, zxing reads upright and sideways codes, the stocktake completes', async ({
    page,
    context,
  }) => {
    await setUp(page, context, { capabilities: 'none', detector: false });
    await open(page, '/app/stores/stocktake');
    await expect(
      page.getByText('Zoom, focus and torch aren’t available in this browser. Chrome has them.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Torch' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Zoom' })).toHaveCount(0);

    await countTin(page, KNOWN, 'Peanut butter (340 g jar)');

    // A code held sideways: the turned attempts find it.
    await show(page, BEANS, true);
    await expect(page.getByText('Open Food Facts says:')).toBeVisible({ timeout: 15_000 });
    await cam(page, 'clear');
    await page.getByRole('button', { name: /Tinned food \(400 g tin\)/ }).click();
    await firstChip(page);
    await ok(page);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('stocktake-summary')).toContainText('2 items');
  });

  test('Chrome-like: torch and zoom controls are there and reach the camera', async ({
    page,
    context,
  }) => {
    await setUp(page, context);
    await open(page, '/app/stores/stocktake');
    await page.getByRole('button', { name: 'Torch' }).click();
    await expect(page.getByRole('button', { name: 'Torch' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Zoom in' }).click();
    const applied = await page.evaluate(
      () => (window as unknown as { __fakeCam: FakeCam }).__fakeCam.applied,
    );
    expect(applied).toContainEqual({ torch: true });
    expect(applied.some((a) => typeof a.zoom === 'number' && a.zoom > 1.75)).toBe(true);
  });

  test('on a 360 by 740 phone OK is above the tab bar with no scrolling', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await setUp(page, context);
    await open(page, '/app/stores/stocktake');
    await show(page, KNOWN);
    await expect(dateCard(page, 'Peanut butter (340 g jar)')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    const [okBox, tabBox] = await Promise.all([
      page.getByRole('button', { name: 'OK', exact: true }).boundingBox(),
      page.getByRole('navigation', { name: 'Main' }).boundingBox(),
    ]);
    expect(okBox!.y + okBox!.height).toBeLessThanOrEqual(tabBox!.y + 1);
    expect(okBox!.y).toBeGreaterThanOrEqual(0);
  });

  test('Quick add: Scan a barcode, a known code, Add', async ({ page, context }) => {
    await setUp(page, context);
    await open(page, '/app/stores');
    await page.getByRole('button', { name: 'Add stock' }).click();
    await page.getByRole('button', { name: 'Scan a barcode' }).click();
    await show(page, KNOWN);
    await expect(page.getByText('Add Peanut butter (340 g jar)')).toBeVisible();
    await cam(page, 'clear');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const d = await doc(page);
    expect(
      Object.values(d.items).filter(
        (i) => i.typeId === 'items-base:peanut-butter-340g' && i.source === 'barcode',
      ),
    ).toHaveLength(1);
  });

  test('privacy: only the app and Open Food Facts are asked, and only for the digits', async ({
    page,
    context,
  }) => {
    const net = await setUp(page, context);
    await open(page, '/app/stores/stocktake');
    await show(page, BEANS);
    await expect(page.getByText('Open Food Facts says:')).toBeVisible();
    await cam(page, 'clear');
    await page.getByRole('button', { name: 'Scan another' }).click();
    await show(page, NOT_FOUND);
    await expect(page.getByText(/does not have this one/)).toBeVisible();

    const appHost = new URL(page.url()).host;
    expect([...net.hosts].filter((h) => h !== appHost && h !== 'world.openfoodfacts.org')).toEqual(
      [],
    );
    expect(net.offUrls.length).toBeGreaterThanOrEqual(1);
    for (const url of net.offUrls) {
      expect(url).toMatch(
        /^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/\d{8,14}\.json\?fields=[a-z_,]+$/,
      );
    }
    for (const h of net.offHeaders) {
      expect(h['x-user-agent']).toMatch(/^SHTF-Planner\/\S+ \(https:\/\/prep\.mm9pdy\.net\)$/);
      expect(h['cookie']).toBeUndefined();
      expect(h['referer']).toBeUndefined();
    }
  });
});
