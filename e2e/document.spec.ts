import { expect, test } from '@playwright/test';

type Shtf = {
  doc: () => Promise<{ household: { members: { name: string }[] }; home: { area?: string } }>;
  loadFixture: () => Promise<void>;
  change: (fn: (d: { home: { area?: string } }) => void) => Promise<void>;
};
const shtf = (page: import('@playwright/test').Page) => ({
  names: () =>
    page.evaluate(async () => {
      const d = await (window as unknown as { __shtf: Shtf }).__shtf.doc();
      return d.household.members.map((m) => m.name);
    }),
  area: () =>
    page.evaluate(
      async () => (await (window as unknown as { __shtf: Shtf }).__shtf.doc()).home.area,
    ),
  loadFixture: () =>
    page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.loadFixture()),
});

test('loadFixture, reload: the document survives', async ({ page }) => {
  await page.goto('/?debug=1');
  const hook = shtf(page);
  expect(await hook.names()).toEqual([]);
  await hook.loadFixture();
  expect(await hook.names()).toEqual(['Alex', 'Sam', 'Robin', 'Jo', 'Pat']);

  await page.reload();
  expect(await hook.names()).toEqual(['Alex', 'Sam', 'Robin', 'Jo', 'Pat']);
  expect(await hook.area()).toBe('ML12');

  // and in the app shell, which opens the same document through the provider
  await page.goto('/app?debug=1');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  expect(await hook.names()).toHaveLength(5);
});

test('an edit followed at once by a reload is kept (ten times over)', async ({ page }) => {
  await page.goto('/app/setup/people?debug=1');
  for (let i = 1; i <= 10; i++) {
    await page.getByRole('button', { name: 'Add a person' }).click();
    await page.getByLabel('Name', { exact: true }).fill(`Person ${i}`);
    await page.getByLabel('Date of birth').fill('1984-03-12');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: `Edit Person ${i}` })).toBeVisible();
    // A reload in the same millisecond as a tap beats any write to disk; a person cannot.
    await page.evaluate(() =>
      (window as unknown as { __shtf: { flush: () => Promise<void> } }).__shtf.flush(),
    );
    await page.reload();
    const names = await shtf(page).names();
    expect(names).toHaveLength(i);
    expect(names[i - 1]).toBe(`Person ${i}`);
  }
});

test('two tabs agree', async ({ context }) => {
  const a = await context.newPage();
  await a.goto('/?debug=1');
  const b = await context.newPage();
  await b.goto('/?debug=1');
  await shtf(a).loadFixture();
  await expect.poll(() => shtf(b).names()).toEqual(['Alex', 'Sam', 'Robin', 'Jo', 'Pat']);

  await b.evaluate(() =>
    (window as unknown as { __shtf: Shtf }).__shtf.change((d) => {
      d.home.area = 'ML12 (edited in tab b)';
    }),
  );
  await expect.poll(() => shtf(a).area()).toBe('ML12 (edited in tab b)');
});
