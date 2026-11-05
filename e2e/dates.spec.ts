import { expect, test, type Page } from '@playwright/test';
import { installFakeCamera, type FakeCam } from './fakeCamera';

// Reading a best-before date with the camera, end to end: the real worker and models (headless
// Chrome has no WebGPU adapter, so the reader runs on WASM), a canvas as the camera.

type Doc = {
  items: Record<string, { typeId: string; bestBefore?: string; source: string }>;
};
type Shtf = { doc: () => Promise<Doc>; loadFixture: () => Promise<void> };

const doc = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.doc());
const show = (page: Page, what: { ean?: string; text?: string }) =>
  page.evaluate((w) => (window as unknown as { __fakeCam: FakeCam }).__fakeCam.show(w), what);

const KNOWN = '3017620422003'; // in the fixture: Peanut butter (340 g jar)
const PEANUT = 'items-base:peanut-butter-340g';
const peanut = async (page: Page) =>
  Object.values((await doc(page)).items).filter(
    (i) => i.typeId === PEANUT && i.source === 'barcode',
  );
const ok = (page: Page) => page.getByRole('button', { name: 'OK', exact: true }).click();
/** Model load on first use, then a couple of frames: generous. */
const READ = { timeout: 90_000 };

async function setUp(page: Page): Promise<Set<string>> {
  const hosts = new Set<string>();
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'http:' || u.protocol === 'https:') hosts.add(u.host);
  });
  await installFakeCamera(page, { capabilities: 'chrome', detector: true });
  await page.goto('/?debug=1');
  await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.loadFixture());
  return hosts;
}

/** Nothing leaves the app's origin, and nothing image-shaped is kept in the browser's storage. */
async function assertPrivate(page: Page, hosts: Set<string>): Promise<void> {
  expect([...hosts].filter((h) => h !== new URL(page.url()).host)).toEqual([]);
  const stored = await page.evaluate(() =>
    Object.entries(localStorage).map(([k, v]) => [k, v.length, v.slice(0, 11)] as const),
  );
  for (const [key, length, head] of stored) {
    expect(length, key).toBeLessThan(2000);
    expect(head, key).not.toMatch(/^data:image|^\{"data":/);
  }
}

async function toDateStep(page: Page): Promise<void> {
  await page.goto('/app/stores/stocktake?debug=1');
  await page.getByLabel('Counting into').selectOption({ label: 'Pantry' });
  await show(page, { ean: KNOWN });
  await expect(page.getByRole('heading', { name: 'Peanut butter (340 g jar)' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

test.describe('camera dates', () => {
  test('stocktake: the label is read, nothing is saved until OK', async ({ page }) => {
    const hosts = await setUp(page);
    await toDateStep(page);
    const before = Object.keys((await doc(page)).items).length;
    await show(page, { text: 'BEST BEFORE 06/2027' });
    await expect(page.getByTestId('date-result')).toContainText('Jun 2027', READ);
    await expect(page.getByTestId('date-status')).toHaveText('Got it');
    // The About line says which provider read it (headless Chrome has no WebGPU adapter).
    await page.getByText('About the date reader').click();
    const about = (await page.getByTestId('date-about').textContent()) ?? '';
    expect(about).toMatch(/^(WebGPU|WASM) · last read \d/);
    test.info().annotations.push({ type: 'reader', description: about });
    expect(Object.keys((await doc(page)).items)).toHaveLength(before);
    await ok(page);
    await expect(page.getByText('1 BARCODE')).toBeVisible();
    expect(await peanut(page)).toEqual([expect.objectContaining({ bestBefore: '2027-06' })]);
    await assertPrivate(page, hosts);
  });

  test('a bare 12.26 is only a suggestion; a tap on it saves', async ({ page }) => {
    const hosts = await setUp(page);
    await toDateStep(page);
    await show(page, { text: '12.26' });
    await expect(page.getByTestId('date-status')).toHaveText('No date found', READ);
    await expect(page.getByTestId('date-result')).toHaveCount(0);
    expect(await peanut(page)).toHaveLength(0);
    await page
      .getByRole('group', { name: 'Suggested dates' })
      .getByRole('button', { name: /^Dec 2026/ })
      .click();
    expect(await peanut(page)).toEqual([expect.objectContaining({ bestBefore: '2026-12' })]);
    await assertPrivate(page, hosts);
  });

  test('offline after install: a camera date still reads', async ({ page, context }) => {
    const hosts = await setUp(page);
    // Wait for the service worker to take over: its install precaches the models and the runtime.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await context.setOffline(true);
    await toDateStep(page);
    await show(page, { text: 'BEST BEFORE 06/2027' });
    await expect(page.getByTestId('date-result')).toContainText('Jun 2027', READ);
    await ok(page);
    expect(await peanut(page)).toEqual([expect.objectContaining({ bestBefore: '2027-06' })]);
    await assertPrivate(page, hosts);
  });

  test('quick add: Read the date, Use this date, Add', async ({ page }) => {
    await setUp(page);
    await page.goto('/app/stores?debug=1');
    await page.getByRole('button', { name: 'Add stock' }).click();
    await page.getByLabel('What are you adding?').fill('peanut');
    await page.getByRole('button', { name: /Peanut butter \(340 g jar\)/ }).click();
    await page.getByRole('button', { name: 'Read the date' }).click();
    await show(page, { text: 'BEST BEFORE 06/2027' });
    await expect(page.getByTestId('date-result')).toContainText('Jun 2027', READ);
    await page.getByRole('button', { name: 'Use this date' }).click();
    await expect(page.locator('input[type="month"]')).toHaveValue('2027-06');
    const before = Object.values((await doc(page)).items).filter((i) => i.bestBefore === '2027-06');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const after = Object.values((await doc(page)).items).filter((i) => i.bestBefore === '2027-06');
    expect(after.length).toBe(before.length + 1);
  });
});

test.describe('the reader cannot load', () => {
  test.use({ serviceWorkers: 'block' });

  test('says so, and the picker saves', async ({ page, context }) => {
    await context.route('**/ocr/paddle/*', (route) => route.abort());
    await setUp(page);
    await toDateStep(page);
    await expect(
      page.getByText('The date reader isn’t available here; pick the date.'),
    ).toBeVisible({ timeout: 30_000 });
    await page
      .getByRole('group', { name: /quick choices/ })
      .getByRole('button')
      .first()
      .click();
    await ok(page);
    const saved = await peanut(page);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.bestBefore).toMatch(/^\d{4}-\d{2}$/);
  });
});
