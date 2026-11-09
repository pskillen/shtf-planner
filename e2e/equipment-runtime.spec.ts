import { expect, test, type Page } from '@playwright/test';

type Shtf = {
  loadFixture: () => Promise<void>;
  flush: () => Promise<void>;
  change: (fn: (d: { stock: Record<string, unknown> }) => void) => Promise<void>;
};

async function fixture(page: Page, path: string): Promise<void> {
  await page.goto('/?debug=1');
  await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.loadFixture());
  await page.goto(`${path}?debug=1`);
}

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
});

test('equipment says what its fuel gives, on the list, in the form and in Stores', async ({
  page,
}) => {
  await fixture(page, '/app/assets');
  const row = page.getByRole('button', { name: 'Edit Gas BBQ' });
  await expect(row).toContainText("3 days at your plan's use");
  expect(await noSideScroll(page)).toBe(true);

  await row.click();
  await expect(page.getByRole('dialog')).toContainText("3 days at your plan's use");
  expect(await noSideScroll(page)).toBe(true);

  await page.goto('/app/stores?debug=1');
  await expect(page.getByRole('link', { name: 'Edit equipment Gas BBQ' })).toContainText(
    "3 days at your plan's use",
  );
  expect(await noSideScroll(page)).toBe(true);
});

test('with no propane in stock the line says so and Quick add opens on the fuel', async ({
  page,
}) => {
  await fixture(page, '/app/assets');
  await page.evaluate(async () => {
    const s = (window as unknown as { __shtf: Shtf }).__shtf;
    await s.change((d) => {
      delete d.stock['stock-propane'];
    });
    await s.flush();
  });
  await page.reload();
  const row = page.getByRole('button', { name: 'Edit Gas BBQ' });
  await expect(row).toContainText('Cooking: no Propane bottle in stock');
  const quick = page.getByRole('button', { name: 'Quick add Propane bottle' });
  await quick.click();
  await expect(page.getByRole('dialog')).toContainText('Propane bottle');
  expect(await noSideScroll(page)).toBe(true);
});
