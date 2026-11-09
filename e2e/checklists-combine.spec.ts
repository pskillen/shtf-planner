import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 360, height: 740 } });

test('combine two scenarios, tick a shared step once, remove and re-add a scenario', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await page.evaluate(() =>
    (window as unknown as { __shtf: { loadFixture: () => Promise<void> } }).__shtf.loadFixture(),
  );
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  await page.goto('/app/more/checklists');
  await page.getByRole('button', { name: 'Combine scenarios' }).click();
  await page.getByRole('checkbox', { name: 'Flood' }).check();
  await page.getByRole('checkbox', { name: 'Storm' }).check();
  expect(await fits()).toBe(true);
  await page.getByRole('link', { name: 'Preview 2 together' }).click();
  await expect(page.getByText(/^For: .*Flood.*Storm|^For: .*Storm.*Flood/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Start these checklists together' }).click();
  await expect(page).toHaveURL(/\/app\/more\/checklists\/(?!preview)[^/]+$/);

  // A step both scenarios supply appears once; ticking it counts once.
  const shared = page.getByRole('checkbox', { name: /^Never drive through floodwater/ });
  await expect(shared).toHaveCount(1);
  await shared.check();
  await expect(page.getByText(/^1 of \d+ done$/)).toBeVisible();

  // Remove Storm, then add it back: the tick is still there.
  await page.getByRole('button', { name: 'Change scenarios' }).click();
  await page.getByRole('checkbox', { name: 'Storm', exact: true }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Flood', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Storm', exact: true }).check();
  await expect(shared).toBeChecked();
  expect(await fits()).toBe(true);

  await page.reload();
  await expect(
    page.getByRole('checkbox', { name: /^Never drive through floodwater/ }),
  ).toBeChecked();
  await expect(page.getByText(/^1 of \d+ done$/)).toBeVisible();
  expect(await fits()).toBe(true);
});
