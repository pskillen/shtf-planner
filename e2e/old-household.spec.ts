import { expect, test } from '@playwright/test';

type Shtf = {
  doc: () => Promise<{ meta: { schemaVersion: number }; stock: Record<string, unknown> }>;
  change: (fn: (d: { meta: { schemaVersion: number } }) => void) => Promise<void>;
  loadFixture: () => Promise<void>;
  flush: () => Promise<void>;
};

test('an older schema on disk shows the start-again screen with no tabs', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.loadFixture());
  await page.evaluate(() =>
    (window as unknown as { __shtf: Shtf }).__shtf.change((d) => {
      d.meta.schemaVersion = 3;
    }),
  );
  await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.flush());
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: /older version/i })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
});

test('Start a new household clears stock and opens onboarding', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.loadFixture());
  await page.evaluate(() =>
    (window as unknown as { __shtf: Shtf }).__shtf.change((d) => {
      d.meta.schemaVersion = 3;
    }),
  );
  await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.flush());
  await page.goto('/app');
  await page.getByRole('button', { name: 'Start a new household' }).click();
  await page.getByRole('button', { name: 'Start a new household' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|People|Household/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.goto('/app?debug=1');
  const doc = await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.doc());
  expect(doc.meta.schemaVersion).toBeGreaterThanOrEqual(4);
  expect(Object.keys(doc.stock)).toHaveLength(0);
});
