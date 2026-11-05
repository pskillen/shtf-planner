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
/** The month field ends at least this far above the OK bar at 360x740 and 412x915. */
const MONTH_SLACK = 24;
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

  test('a finished read survives the page being hidden and shown; a new search can follow', async ({
    page,
  }) => {
    await setUp(page);
    await toDateStep(page);
    await show(page, { text: 'BEST BEFORE 06/2027' });
    await expect(page.getByTestId('date-result')).toContainText('Jun 2027', READ);
    const hide = (state: 'hidden' | 'visible') =>
      page.evaluate((s) => {
        Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }, state);
    await hide('hidden');
    await show(page, { text: 'BEST BEFORE 03/2028' });
    await hide('visible');
    await page.waitForTimeout(1500);
    // Still what the person saw, not what the camera shows now.
    await expect(page.getByTestId('date-result')).toContainText('Jun 2027');
    await expect(page.locator('input[type="month"]')).toHaveValue('2027-06');
    // Read again loads a fresh reader (the hidden page let the old one go) and reads the new label.
    await page.getByRole('button', { name: 'Read again' }).click();
    await expect(page.getByTestId('date-result')).toContainText('Mar 2028', READ);
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

for (const size of [
  { width: 360, height: 740 },
  { width: 412, height: 915 },
]) {
  test.describe(`layout at ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    // Chrome has a month picker; Firefox (and any browser without one) gets a text box with a hint.
    for (const [hintShown, monthBox] of [
      [false, 'picker'],
      [false, 'text box'],
      [true, 'picker'],
    ] as const) {
      test(`one strip size; status and month on the strip; month field above OK (hint ${hintShown ? 'showing' : 'dismissed'}, month ${monthBox})`, async ({
        page,
      }) => {
        if (monthBox === 'text box') {
          // The page's own probe sets type=month and reads it back: make that read say "text".
          await page.addInitScript(() => {
            const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'type')!;
            Object.defineProperty(HTMLInputElement.prototype, 'type', {
              ...desc,
              get() {
                const t = desc.get!.call(this) as string;
                return t === 'month' ? 'text' : t;
              },
            });
          });
        }
        if (!hintShown) {
          await page.addInitScript(() => localStorage.setItem('shtf.stocktake.hintSeen', '1'));
        }
        await setUp(page);
        await page.goto('/app/stores/stocktake?debug=1');
        await page.getByLabel('Counting into').selectOption({ label: 'Pantry' });
        const box = async (loc: ReturnType<Page['locator']>) => (await loc.boundingBox())!;
        const strip = page.getByTestId('camera-strip');
        const stripBarcode = await box(strip);
        if (hintShown) {
          // The one-line hint leaves "Use this number" above the tab bar on the barcode step.
          const tabTop = (await box(page.getByRole('navigation', { name: 'Main' }))).y;
          const use = await box(page.getByRole('button', { name: 'Use this number' }));
          expect(use.y + use.height).toBeLessThanOrEqual(tabTop);
          await page.screenshot({
            path: `test-results/p9-tweaks-barcode-${size.width}x${size.height}-hint-on.png`,
          });
        }

        await show(page, { ean: KNOWN });
        await expect(
          page.getByRole('heading', { name: 'Peanut butter (340 g jar)' }),
        ).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
        const status = page.getByTestId('date-status');
        await show(page, { text: '   ' });
        await expect(status).toBeVisible();
        const stripAiming = await box(strip);
        // One camera size for both steps: it never changes.
        expect(stripAiming.height).toBeCloseTo(stripBarcode.height, 0);
        expect(stripAiming.width).toBeCloseTo(stripBarcode.width, 0);
        // The strip's top is in the same place on both steps (the page does not jump at the catch).
        expect(stripAiming.y).toBeCloseTo(stripBarcode.y, 0);
        // While aiming, the status sits at the top edge of the date box, clear of its middle.
        const s = await box(status);
        const boxTop = stripAiming.y + stripAiming.height * 0.22;
        const boxMid = stripAiming.y + stripAiming.height * 0.5;
        expect(s.y).toBeGreaterThanOrEqual(boxTop - 2);
        expect(s.y + s.height).toBeLessThan(boxMid - stripAiming.height * 0.1);
        test.info().annotations.push({
          type: 'pill',
          description: `${size.width}x${size.height}: pill y ${Math.round(s.y - stripAiming.y)}..${Math.round(s.y + s.height - stripAiming.y)} of a ${Math.round(stripAiming.height)} px strip; date box ${Math.round(boxTop - stripAiming.y)}..${Math.round(stripAiming.y + stripAiming.height * 0.78 - stripAiming.y)}`,
        });
        await page.screenshot({
          path: `test-results/p9b-aiming-${size.width}x${size.height}-hint-${hintShown ? 'on' : 'off'}-${monthBox === 'picker' ? 'picker' : 'text'}.png`,
        });

        const month = page.locator('input[type="month"], input[placeholder="Mar 2027"]');
        const okBtn = page.getByRole('button', { name: 'OK', exact: true });
        const barTop = async () => (await box(okBtn)).y - 8;
        const monthState = 'above the OK bar';
        if (!hintShown) {
          const m = await box(month);
          expect(m.y).toBeGreaterThanOrEqual(0);
          expect(m.y + m.height).toBeLessThanOrEqual((await barTop()) - MONTH_SLACK);
        } else {
          // The hint is one line, so the month field clears the OK bar with it showing too.
          const m = await box(month);
          expect(m.y + m.height).toBeLessThanOrEqual((await barTop()) - MONTH_SLACK);
        }
        // The date box on the screen is 88% by 56% of the strip.
        test.info().annotations.push({
          type: 'layout',
          description: `${size.width}x${size.height} hint ${hintShown ? 'showing' : 'dismissed'}: strip ${Math.round(stripAiming.width)}x${Math.round(stripAiming.height)}, date box ${Math.round(stripAiming.width * 0.88)}x${Math.round(stripAiming.height * 0.56)}, month field ${monthState}`,
        });

        // After Got it: the month is on the strip, and the strip is the same size.
        await show(page, { text: 'BEST BEFORE 06/2027' });
        const card = page.getByTestId('date-result');
        await expect(card).toContainText('Jun 2027', READ);
        await page.evaluate(() => window.scrollTo(0, 0));
        const after = await box(strip);
        expect(after.height).toBeCloseTo(stripBarcode.height, 0);
        await page.screenshot({
          path: `test-results/p9b-got-${size.width}x${size.height}-hint-${hintShown ? 'on' : 'off'}-${monthBox === 'picker' ? 'picker' : 'text'}.png`,
        });
        const c = await box(card);
        expect(c.y).toBeGreaterThanOrEqual(after.y);
        expect(c.y + c.height).toBeLessThanOrEqual(after.y + after.height);
        {
          const m = await box(month);
          expect(m.y + m.height).toBeLessThanOrEqual((await barTop()) - MONTH_SLACK);
        }
        const chips = page.getByRole('group', { name: /quick choices/ });
        const cb2 = await box(chips);
        const m2 = await box(month);
        // With the hint dismissed the quick-choice chips clear the bar too, in both renderings.
        if (!hintShown) expect(cb2.y + cb2.height).toBeLessThanOrEqual((await barTop()) - 8);
        test.info().annotations.push({
          type: 'slack',
          description: `${size.width}x${size.height} hint ${hintShown ? 'on' : 'off'} month ${monthBox}: month field ${Math.round((await barTop()) - (m2.y + m2.height))} px clear of the OK bar, chips ${Math.round((await barTop()) - (cb2.y + cb2.height))} px`,
        });
      });
    }
  });
}
