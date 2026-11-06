import { expect, test } from '@playwright/test';
import type { Document } from '../src/model';

type Shtf = {
  loadFixture: () => Promise<void>;
  change: (fn: (doc: Document) => void) => Promise<void>;
};

test('an old household sees a review badge on Home', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.evaluate(async () => {
    const hook = (window as unknown as { __shtf: Shtf }).__shtf;
    await hook.loadFixture();
    await hook.change((doc) => {
      doc.meta.createdAt = '2020-01-01T00:00:00Z';
      doc.reviews = {};
    });
  });
  await page.goto('/app');
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByText('Review due'),
  ).toBeVisible();
  await expect(page.getByText('Review due', { exact: true })).toHaveCount(2);
});
