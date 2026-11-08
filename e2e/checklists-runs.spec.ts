import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 360, height: 740 } });

test('start a run, tick a step, reload and it is still ticked', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.evaluate(() =>
    (window as unknown as { __shtf: { loadFixture: () => Promise<void> } }).__shtf.loadFixture(),
  );
  await page.goto('/app/more/checklists');
  await page.locator('a[href*="/preview/"]', { hasText: /^Flood/ }).click();
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

test('note a step, reload, finish and read the history', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.evaluate(() =>
    (window as unknown as { __shtf: { loadFixture: () => Promise<void> } }).__shtf.loadFixture(),
  );
  await page.goto('/app/more/checklists');
  // The invented finished incident is on the hub, last.
  await expect(page.getByRole('heading', { name: 'Finished lists' })).toBeVisible();
  await page.locator('a[href*="/preview/"]', { hasText: /^Flood/ }).click();
  await page.getByRole('button', { name: 'Start this checklist' }).click();
  await expect(page.getByRole('heading', { name: 'Flood', level: 1 })).toBeVisible();

  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  const note = page.getByRole('textbox').first();
  await note.fill('Sandbags are in the shed');
  // Saved a moment after typing stops, with no tick on the step.
  await page.waitForTimeout(900);
  await expect(page.getByRole('checkbox').first()).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole('textbox').first()).toHaveValue('Sandbags are in the shed');
  await expect(page.getByText(/^0 of \d+ done$/)).toBeVisible();

  // Every box and button is at least 44 px tall and nothing scrolls sideways.
  const small = await page.evaluate(
    () =>
      Array.from(
        document.querySelectorAll('main textarea, main button, main label.check-row'),
      ).filter((e) => (e as HTMLElement).getBoundingClientRect().height < 44).length,
  );
  expect(small).toBe(0);
  expect(await fits()).toBe(true);

  // Finish with a note still being typed: it is kept.
  await page.getByRole('textbox').nth(1).fill('Called the council at noon');
  await page.getByRole('button', { name: 'Finish this list' }).click();
  await page.getByRole('button', { name: 'Yes, finish' }).click();
  await expect(page.getByText(/Finished \d/)).toBeVisible();
  await expect(page.getByRole('checkbox').first()).toBeDisabled();
  await expect(page.getByRole('textbox').first()).toBeDisabled();
  await expect(page.getByRole('textbox').nth(1)).toHaveValue('Called the council at noon');
  await page.reload();
  await expect(page.getByRole('textbox').nth(1)).toHaveValue('Called the council at noon');
  await expect(page.getByRole('button', { name: /Finish this list/ })).toHaveCount(0);
  expect(await fits()).toBe(true);

  // History: finished lists are on the hub and open read-only.
  await page.getByRole('link', { name: /Checklists/ }).click();
  await expect(page.getByRole('heading', { name: 'Finished lists' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your lists' })).toHaveCount(0);
  await page
    .locator('a.card', { hasText: /Finished/ })
    .first()
    .click();
  await expect(page.getByRole('checkbox').first()).toBeDisabled();
  expect(await fits()).toBe(true);
});
