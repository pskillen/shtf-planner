import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 360, height: 740 } });

test('browse scenarios from More and preview the longest step without sideways scroll', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await page.evaluate(() =>
    (window as unknown as { __shtf: { loadFixture: () => Promise<void> } }).__shtf.loadFixture(),
  );
  await page.goto('/app/more');
  await page.getByRole('link', { name: /Scenario checklists/ }).click();
  await expect(page).toHaveURL(/\/app\/more\/checklists$/);

  const hubWidth = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(await hubWidth()).toBe(true);

  await page.getByRole('link', { name: /^Evacuation/ }).click();
  await expect(page.getByRole('heading', { name: 'Evacuation', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Immediately' })).toBeVisible();
  await expect(page.getByText(/0800 111 999/)).toBeVisible();
  expect(await hubWidth()).toBe(true);

  // Every link is a 44 px target.
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('main a')]
      .filter((a) => (a as HTMLElement).getBoundingClientRect().height < 44)
      .map((a) => a.textContent),
  );
  expect(small).toEqual([]);

  await page.getByRole('link', { name: /Checklists/ }).click();
  await expect(page).toHaveURL(/\/app\/more\/checklists$/);
});
