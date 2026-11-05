import { expect, test, type Page } from '@playwright/test';

type Shtf = {
  doc: () => Promise<{
    products: Record<string, unknown>;
    stock: Record<string, { productId: string; qty: number; locationId: string }>;
    plans: Record<string, { doneAt?: string; expires?: string }>;
    minimums: Record<string, number>;
    meta: { schemaVersion: number };
  }>;
  loadFixture: () => Promise<void>;
  flush: () => Promise<void>;
  engine: {
    coverage: (
      asOf?: string,
      horizonDays?: number,
    ) => Promise<{ targetId: string; amount: number }[]>;
  };
};
const doc = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.doc());

async function pickSizeInDialog(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  const yours = dialog.getByRole('region', { name: 'Your products' });
  if (await yours.isVisible().catch(() => false)) {
    await yours.getByRole('button').first().click();
    return;
  }
  const suggested = dialog.getByRole('region', { name: 'Suggested sizes' });
  if (await suggested.isVisible().catch(() => false)) {
    await suggested.getByRole('button').first().click();
  }
}

async function fixture(page: Page, path = '/app/stores'): Promise<void> {
  await page.goto('/?debug=1');
  await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.loadFixture());
  await page.goto(`${path}?debug=1`);
}

const meter = async (page: Page, name: string): Promise<number> =>
  Number(await page.getByRole('meter', { name, exact: true }).getAttribute('aria-valuenow'));

async function scoreOf(page: Page, name: string): Promise<number> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Score' }).click();
  await expect(page.getByRole('heading', { name: 'Score' })).toBeVisible();
  return meter(page, name);
}

/** The litres short in the Shopping list's water row ("water: 27.3 L short of 3 days"); 0 once it is gone. */
async function waterLitres(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const rows = await (window as unknown as { __shtf: Shtf }).__shtf.engine.coverage(
      '2026-11-15',
      3,
    );
    return rows.find((c) => c.targetId === 'water:waterL')!.amount;
  });
}

async function waterShort(page: Page): Promise<number> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Gaps' }).click();
  await expect(page.getByRole('heading', { name: 'Shopping' })).toBeVisible();
  const row = page.getByText(/^water: [\d.]+ L short of 3 days/).first();
  if ((await row.count()) === 0) return 0;
  return Number(/water: ([\d.]+) L/.exec(await row.innerText())![1]);
}

test('the fixture household: the Stores tab groups stock by item, flags the odd item, shows minimums', async ({
  page,
}) => {
  await fixture(page);
  await expect(page.getByRole('heading', { name: 'Stores' })).toBeVisible();
  await expect(page.getByText('min 2').first()).toBeVisible();
  await page.getByLabel('Place filter').selectOption({ label: 'Pantry' });
  await expect(
    page.getByText('This place rotates: the minimum counts, not today’s stock.'),
  ).toBeVisible();
  await expect(page.locator('.bb-expired').first()).toBeVisible();
  await page.getByLabel('Place filter').selectOption({ label: 'All places' });
  await page.getByLabel('Search stock').fill('torch');
  await expect(page.getByRole('button', { name: /Edit .* LED torch in / })).toHaveCount(3);
  await expect(page.getByText('Propane 13 kg')).toHaveCount(0);
});

test('Quick add: nine items, two of them added again, each in few taps', async ({ page }) => {
  await fixture(page);
  const waterBefore = await waterLitres(page);
  const plansBefore = await scoreOf(page, 'Plans');
  const shortBefore = await waterShort(page);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Stores' })
    .click();

  const taps: number[] = [];
  let count = 0;
  const tap = async (fn: () => Promise<unknown>) => {
    count += 1;
    await fn();
  };

  /** Search, pick (not counted), size when shown, then qty, a best-before chip and Add (counted). */
  async function plain(search: string, name: RegExp, opts: { more?: number; chip?: string } = {}) {
    const dialog = page.getByRole('dialog');
    if (!(await dialog.isVisible())) await page.getByRole('button', { name: 'Add stock' }).click();
    const box = page.getByRole('searchbox', { name: 'What are you adding?' });
    await box.fill(search);
    await page.getByRole('dialog').getByRole('button', { name }).first().click();
    count = 0;
    await tap(() => pickSizeInDialog(page));
    for (let i = 0; i < (opts.more ?? 0); i++) {
      await tap(() => page.getByRole('button', { name: /^One more/ }).click());
    }
    if (opts.chip) await tap(() => page.getByRole('button', { name: opts.chip! }).click());
    await tap(() => page.getByRole('button', { name: 'Add', exact: true }).click());
    taps.push(count);
  }

  // The first add chooses a place (the next ones start from it).
  count = 0;
  await tap(() => page.getByRole('button', { name: 'Add stock' }).click());
  await page.getByRole('searchbox', { name: 'What are you adding?' }).fill('water container');
  await tap(() =>
    page
      .getByRole('dialog')
      .getByRole('button', { name: /Water containers/i })
      .click(),
  );
  await tap(() => pickSizeInDialog(page));
  await tap(() => page.getByLabel('Where does it go?').selectOption({ label: 'Garage' }));
  await tap(() => page.getByRole('button', { name: 'Add', exact: true }).click());
  await expect(page.getByTestId('last-add-status')).toContainText(/Added 1 × .* to Garage/);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('searchbox', { name: 'What are you adding?' }).fill('water container');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Water containers/i })
      .click();
    count = 0;
    await tap(() => pickSizeInDialog(page));
    await tap(() => page.getByRole('button', { name: 'Add', exact: true }).click());
  }
  await expect(page.getByTestId('added-count')).toHaveText('Added this session: 3');

  // The place starts where the type lives, else the last one used: a plain item is a few taps.
  await plain('bottled', /Bottled water/, { more: 1, chip: '+1 y' });
  await plain('soup', /Tinned soup/, { chip: '+2 y' });
  await plain('rice', /Rice/);
  await plain('oats', /Porridge oats/, { chip: '+1 y' });
  await plain('candles', /Candles/);
  expect(Math.max(...taps)).toBeLessThanOrEqual(6);
  expect(taps).toEqual([4, 3, 2, 3, 2]);

  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByLabel('Search stock').fill('water container');
  await expect(page.getByRole('button', { name: /Edit .* in Garage/ }).first()).toBeVisible();

  await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.flush());
  await page.goto('/app/stores?debug=1');
  const after = await doc(page);
  expect(after.meta.schemaVersion).toBe(4);
  expect(Object.keys(after.stock).length).toBeGreaterThan(15);

  // The score and the shopping list move with the stock.
  expect(await waterLitres(page)).toBeGreaterThan(waterBefore);
  if (shortBefore > 0) expect(await waterShort(page)).toBeLessThan(shortBefore);

  // A plan item marked done is recorded, with its date. The plans score is (done / total) to the
  // power 1.5, so one more done moves it: 1 of 9 is 4 %, 2 of 9 is 10 %.
  const gapsLink = page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Gaps' });
  await gapsLink.click();
  await page.getByRole('button', { name: /^Done: Write down 999 or 112/ }).click();
  await expect(page.getByRole('button', { name: /^Done: Write down 999 or 112/ })).toHaveCount(0);
  // Done waits five seconds behind an Undo toast before it is written.
  await expect(page.getByRole('status')).toContainText('Marked done: Write down 999 or 112');
  await expect
    .poll(async () => (await doc(page)).plans['plans-base:emergency-numbers']?.doneAt, {
      timeout: 10_000,
    })
    .toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(
    page.getByRole('button', { name: /^Undo done: Write down 999 or 112/ }),
  ).toBeVisible();
  expect(plansBefore).toBe(4);
  expect(await scoreOf(page, 'Plans')).toBe(10);
});

test('a pantry floor counts towards food, and Gaps hands a ticked row to Quick add', async ({
  page,
}) => {
  await fixture(page);
  const food = async () =>
    (
      await page.evaluate(() =>
        (window as unknown as { __shtf: Shtf }).__shtf.engine.coverage('2026-11-15', 3),
      )
    ).find((c) => c.targetId === 'food:foodKcal')!.amount;
  const before = await food();

  await page.getByLabel('Place filter').selectOption({ label: 'Pantry' });
  await page.getByRole('button', { name: 'Set a minimum' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Baked beans/i })
    .click();
  await page
    .getByRole('button', { name: /^One more: Minimum for Baked beans in the Pantry/ })
    .click();
  await page.getByRole('button', { name: 'Save minimums' }).click();
  expect((await food()) - before).toBeGreaterThan(0);

  // Ticking a shopping row opens Quick add with that item.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Gaps' }).click();
  await page
    .getByRole('button', { name: /^Bought: \d+ × / })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel(/^How many/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(/^Added \d+ × /)).toBeVisible();
});

test('Quick add warns when the place does not suit the item, and still allows it', async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole('button', { name: 'Add stock' }).click();
  await page.getByRole('searchbox', { name: 'What are you adding?' }).fill('uht');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /UHT milk/ })
    .click();
  await pickSizeInDialog(page);
  await page.getByLabel('Where does it go?').selectOption({ label: 'Shed' });
  await expect(page.getByRole('status').filter({ hasText: 'in the Shed' })).toContainText(
    'You can still add it.',
  );
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByLabel('Place filter').selectOption({ label: 'Shed' });
  await page.getByLabel('Search stock').fill('uht');
  await page.getByRole('button', { name: /UHT milk ·/i }).click();
  await expect(page.getByText(/⚠/).first()).toBeVisible();
});

test('Equipment marks solar with no EPS as blocked', async ({ page }) => {
  await fixture(page, '/app/assets');
  await expect(page.getByRole('button', { name: 'Edit Roof solar' })).toContainText('Blocked');
});

test('the three tabs and Quick add fit a 375 px phone with big targets', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await fixture(page);
  for (const path of ['stores', 'gaps', 'score']) {
    await page.goto(`/app/${path}?debug=1`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const wide = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(wide, path).toBe(false);
  }
  await page.goto('/app/stores?debug=1');
  await page.getByRole('button', { name: 'Add stock' }).click();
  // with nothing typed the types sit under collapsed categories, not in one long list
  await expect(page.getByRole('dialog').locator('details.type-group').first()).toBeVisible();
  await page.getByRole('searchbox', { name: 'What are you adding?' }).fill('tinned');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Tinned soup/ })
    .click();
  await pickSizeInDialog(page);
  for (const name of [/^One more/, /^One fewer/, 'Add']) {
    const box = await page.getByRole('button', { name }).first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});
