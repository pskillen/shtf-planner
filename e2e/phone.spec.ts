import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

test('the horizon table shows Need and one horizon on a phone, and the control switches it', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await page.evaluate(() =>
    (window as unknown as { __shtf: { loadFixture: () => Promise<void> } }).__shtf.loadFixture(),
  );
  await page.goto('/app/horizon');

  const headers = page.locator('table.horizon thead th');
  await expect(headers.filter({ visible: true })).toHaveText(['Need', '3 days']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await page.getByRole('radio', { name: '28 days' }).last().click();
  await expect(headers.filter({ visible: true })).toHaveText(['Need', '28 days']);
});
