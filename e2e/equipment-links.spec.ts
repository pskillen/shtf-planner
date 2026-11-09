import { expect, test, type Page } from '@playwright/test';

type Shtf = {
  loadFixture: () => Promise<void>;
  flush: () => Promise<void>;
  change: (fn: (d: { settings: { horizonDays: number } }) => void) => unknown;
};

const shtf = (page: Page, run: 'loadFixture' | 'flush' | 'month') =>
  page.evaluate((what) => {
    const s = (window as unknown as { __shtf: Shtf }).__shtf;
    if (what === 'month') return s.change((d) => void (d.settings.horizonDays = 28));
    return s[what]();
  }, run);

async function fixture(page: Page, path: string): Promise<void> {
  await page.goto('/?debug=1');
  await shtf(page, 'loadFixture');
  await page.goto(`${path}?debug=1`);
}

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.use({ viewport: { width: 360, height: 740 } });

test('Gaps to do opens the Roof solar form from its EPS task', async ({ page }) => {
  await fixture(page, '/app/gaps');
  const open = page.getByRole('link', { name: 'Open Roof solar' });
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await open.click();
  await expect(page.getByText('Edit Roof solar')).toBeVisible();
});

test('Shopping opens the Gas BBQ, and the tick still opens Quick add', async ({ page }) => {
  await fixture(page, '/app/gaps');
  await shtf(page, 'month');
  await shtf(page, 'flush');
  await page.goto('/app/gaps/shopping?need=cooking&debug=1');
  expect(await noSideScroll(page)).toBe(true);
  const open = page.getByRole('link', { name: 'Open Gas BBQ' });
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await open.click();
  await expect(page.getByText('Edit Gas BBQ')).toBeVisible();

  await page.goto('/app/gaps/shopping?need=cooking&debug=1');
  await page.getByRole('button', { name: /Bought: Propane bottle/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Propane bottle/).first()).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
});
