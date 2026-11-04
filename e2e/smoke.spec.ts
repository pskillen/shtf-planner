import { expect, test } from '@playwright/test';

type Shtf = { loadFixture: () => Promise<void> };

test('landing page, Start, shell and footer', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.loadFixture());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'SHTF Planner' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Changelog' })).toBeVisible();
  await expect(page.getByTestId('footer')).toContainText('local');

  await page.getByRole('link', { name: 'Start' }).click();
  await expect(page).toHaveURL(/\/app$/);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav).toBeVisible();

  await nav.getByRole('link', { name: 'Stores' }).click();
  await expect(page).toHaveURL(/\/app\/stores$/);
  await expect(page.getByText('Coming in a later phase.')).toBeVisible();
  await expect(page.getByTestId('footer')).toHaveText('SHTF Planner · local · local');
});

test('deep links work (the PWA serves index.html for every path)', async ({ page }) => {
  await page.goto('/app/score');
  await expect(page.getByRole('heading', { name: 'Score' })).toBeVisible();
});

test('?debug=1 installs window.__shtf', async ({ page }) => {
  await page.goto('/?debug=1');
  expect(await page.evaluate(() => typeof (window as unknown as { __shtf?: unknown }).__shtf)).toBe(
    'object',
  );
  await page.goto('/');
  expect(await page.evaluate(() => typeof (window as unknown as { __shtf?: unknown }).__shtf)).toBe(
    'undefined',
  );
});
