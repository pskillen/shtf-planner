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
