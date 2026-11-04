import { expect, test, type Page } from '@playwright/test';

type Shtf = {
  doc: () => Promise<{
    items: Record<string, { typeId: string; qty: number; locationId: string }>;
    customTypes: Record<string, { name: string; gives: { store: string; amount: number }[] }>;
    plans: Record<string, { doneAt?: string; expires?: string }>;
    floors: Record<string, number>;
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
async function waterShort(page: Page): Promise<number> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Gaps' }).click();
  await expect(page.getByRole('heading', { name: 'Shopping' })).toBeVisible();
  const row = page.getByText(/^water: [\d.]+ L short of 3 days/).first();
  if ((await row.count()) === 0) return 0;
  return Number(/water: ([\d.]+) L/.exec(await row.innerText())![1]);
}

test('the fixture household: the Stores tab groups stock by place, flags the odd item, shows floors', async ({
  page,
}) => {
  await fixture(page);
  await expect(page.getByRole('heading', { name: 'Stores' })).toBeVisible();
  // grouped by place, with a floor badge on the rotating pantry and a past best-before
  await expect(page.getByRole('region', { name: 'Pantry' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Pantry' }).getByText('floor 2').first(),
  ).toBeVisible();
  await expect(
    page.getByText('This place rotates: the floor counts, not today’s stock.'),
  ).toBeVisible();
  await expect(page.locator('.bb-past').first()).toBeVisible();
  // search narrows across places
  await page.getByLabel('Search stock').fill('torch');
  await expect(page.getByRole('button', { name: /Edit .*[Tt]orch/ })).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'Shed' })).toHaveCount(0);
});

test('Quick add: ten items, two of them same-again and one custom, each in few taps', async ({
  page,
}) => {
  await fixture(page);
  const waterBefore = await scoreOf(page, 'Water');
  const plansBefore = await meter(page, 'Plans');
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

  /** Search, pick (not counted), then qty, a best-before chip and Add (counted). */
  async function plain(search: string, name: RegExp, opts: { more?: number; chip?: string } = {}) {
    const dialog = page.getByRole('dialog');
    if (!(await dialog.isVisible())) await page.getByRole('button', { name: 'Add stock' }).click();
    const box = page.getByRole('searchbox', { name: 'What are you adding?' });
    await box.fill(search);
    await page.getByRole('dialog').getByRole('button', { name }).first().click();
    count = 0;
    for (let i = 0; i < (opts.more ?? 0); i++) {
      await tap(() => page.getByRole('button', { name: /^One more/ }).click());
    }
    if (opts.chip) await tap(() => page.getByRole('button', { name: opts.chip! }).click());
    await tap(() => page.getByRole('button', { name: 'Add', exact: true }).click());
    // The sheet stays open for the next one: one tap to go back to the search.
    await tap(() => page.getByRole('button', { name: 'Next item' }).click());
    taps.push(count);
  }

  // The first add chooses a place (the next ones start from it).
  await page.getByRole('button', { name: 'Add stock' }).click();
  await page.getByRole('searchbox', { name: 'What are you adding?' }).fill('water can');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Water can \(10 L\)/ })
    .click();
  await page.getByLabel('Where does it go?').selectOption({ label: 'Garage' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Added 1 × Water can (10 L) to Garage')).toBeVisible();
  // same again, twice
  await page.getByRole('button', { name: 'Same again' }).click();
  await page.getByRole('button', { name: 'Same again' }).click();
  await expect(page.getByTestId('added-count')).toHaveText('Added this session: 3');
  await page.getByRole('button', { name: 'Next item' }).click();

  // The place starts where the type lives, else the last one used: a plain item is a few taps.
  await plain('bottled', /Bottled water/, { more: 1, chip: '+1 y' });
  await plain('tinned', /Tinned food/, { chip: '+2 y' });
  await plain('rice', /Rice \(10 kg sack\)/);
  await plain('oats', /Porridge oats/, { chip: '+1 y' });
  await plain('energy', /Energy bars/, { chip: '+1 y' });
  await plain('matches', /Matches and lighters/);
  expect(Math.max(...taps)).toBeLessThanOrEqual(6);
  expect(taps).toEqual([4, 3, 2, 3, 3, 2]);

  // A custom item: a name, kcal in one jar, then it is added like any other.
  await page.getByRole('searchbox', { name: 'What are you adding?' }).fill("Gran's soup");
  await page.getByRole('button', { name: 'Add as a custom item' }).click();
  await expect(page.getByLabel('Name')).toHaveValue("Gran's soup");
  await page.getByLabel('One piece is a…').fill('jar');
  await page.getByLabel('About how many kcal?').fill('600');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  // a type with no stock anywhere goes to the place last used
  await expect(page.getByText(/^Added 1 × Gran's soup to /)).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  // Ten entries: the stock list shows what was added.
  await expect(page.getByRole('button', { name: /^Edit Gran's soup/ })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Garage' }).getByRole('button', { name: /^Edit Water can/ }),
  ).toContainText('5 × can');

  await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.flush());
  await page.goto('/app/stores?debug=1');
  const after = await doc(page);
  expect(after.meta.schemaVersion).toBe(2);
  expect(Object.values(after.customTypes).map((t) => t.name)).toEqual(["Gran's soup"]);
  expect(Object.values(after.customTypes)[0]!.gives).toEqual([{ store: 'foodKcal', amount: 600 }]);

  // The score and the shopping list move with the stock.
  expect(await scoreOf(page, 'Water')).toBeGreaterThan(waterBefore);
  expect(await waterShort(page)).toBeLessThan(shortBefore);

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

  await page.getByRole('button', { name: 'Set floors' }).click();
  await page.getByRole('button', { name: /^One more: Floor for Tinned food/ }).click();
  await page.getByRole('button', { name: 'Save floors' }).click();
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
  await page.getByLabel('Where does it go?').selectOption({ label: 'Shed' });
  await expect(page.getByRole('status').filter({ hasText: 'in the Shed' })).toContainText(
    'You can still add it.',
  );
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('region', { name: 'Shed' }).getByText(/⚠/).first()).toBeVisible();
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
    .getByRole('button', { name: /Tinned food/ })
    .click();
  for (const name of [/^One more/, /^One fewer/, 'Add']) {
    const box = await page.getByRole('button', { name }).first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});
