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

test('Back closes an open sheet first, and a stray tap asks before dropping edits', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await page.evaluate(() =>
    (window as unknown as { __shtf: { loadFixture: () => Promise<void> } }).__shtf.loadFixture(),
  );
  await page.goto('/app/people');

  await page.getByRole('button', { name: 'Edit Pat' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\/people$/);

  await page.getByRole('button', { name: 'Edit Pat' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Patricia');
  await page.mouse.click(10, 10); // the backdrop
  await expect(page.getByText('Discard your changes?')).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Patricia');
  await page.goBack();
  await expect(page.getByText('Discard your changes?')).toBeVisible();
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit Pat' })).toBeVisible();
});
