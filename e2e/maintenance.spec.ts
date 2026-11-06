import { expect, test } from '@playwright/test';

test('records a smoke alarm test on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/assets?debug=1');
  await page.evaluate(() =>
    (window as unknown as { __shtf: { loadFixture: () => Promise<void> } }).__shtf.loadFixture(),
  );
  await page.getByRole('button', { name: 'Edit Hall smoke alarm' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Not recorded').first()).toBeVisible();
  await sheet.getByRole('button', { name: 'Done today' }).first().click();
  await expect(sheet.getByText(/Last done .* next due/)).toBeVisible();
  await expect(sheet.getByRole('status')).toHaveText('Saved');
});
