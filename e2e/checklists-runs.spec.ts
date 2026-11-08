import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 360, height: 740 } });

test('start a run, tick a step, reload and it is still ticked', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.evaluate(() =>
    (window as unknown as { __shtf: { loadFixture: () => Promise<void> } }).__shtf.loadFixture(),
  );
  await page.goto('/app/more/checklists');
  await page.getByRole('link', { name: /^Flood/ }).click();
  await page.getByRole('button', { name: 'Start this checklist' }).click();
  await expect(page).toHaveURL(/\/app\/more\/checklists\/(?!preview)[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Flood', level: 1 })).toBeVisible();

  const first = page.getByRole('checkbox').first();
  await first.check();
  await expect(first).toBeChecked();
  await expect(page.getByText(/^1 of \d+ done$/)).toBeVisible();

  // Every checkbox row is at least 44 px tall and nothing scrolls sideways.
  const small = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('main label.check-row')).filter(
        (l) => (l as HTMLElement).getBoundingClientRect().height < 44,
      ).length,
  );
  expect(small).toBe(0);
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(await fits()).toBe(true);

  await page.reload();
  await expect(page.getByRole('checkbox').first()).toBeChecked();
  await expect(page.getByText(/^1 of \d+ done$/)).toBeVisible();
  expect(await fits()).toBe(true);

  // The hub lists it, and the list reopens still ticked.
  await page.getByRole('link', { name: /Checklists/ }).click();
  await expect(page.getByRole('heading', { name: 'Your lists' })).toBeVisible();
  await page.getByRole('link', { name: /^Flood.*1 of/ }).click();
  await expect(page.getByRole('checkbox').first()).toBeChecked();
});
