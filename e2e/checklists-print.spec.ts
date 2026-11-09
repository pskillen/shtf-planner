import { expect, test } from '@playwright/test';

test('the print view hides the app and prints black on white, even in dark mode', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/?debug=1');
  await page.evaluate(() =>
    (window as unknown as { __shtf: { loadFixture: () => Promise<void> } }).__shtf.loadFixture(),
  );
  await page.goto('/app/more/checklists/preview/checklists-uk%3Aflood/print');
  await expect(page.getByRole('heading', { level: 1, name: 'Flood' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();

  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  await expect(page.getByRole('button', { name: 'Print' })).toBeHidden();
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('.tabbar')).toBeHidden();
  const colours = await page.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    fg: getComputedStyle(document.body).color,
  }));
  expect(colours).toEqual({ bg: 'rgb(255, 255, 255)', fg: 'rgb(0, 0, 0)' });
});
