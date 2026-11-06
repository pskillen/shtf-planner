import { expect, test } from '@playwright/test';
import type { Document } from '../src/model';

test('review lists every kind and opens its entity on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
  await page.goto('/?debug=1');
  await page.evaluate(async () => {
    const hook = (window as unknown as { __shtf: unknown }).__shtf as {
      loadFixture: () => Promise<void>;
      change: (fn: (doc: Document) => void) => Promise<void>;
    };
    await hook.loadFixture();
    await hook.change((doc) => {
      doc.household.members.push({
        id: 'baby:alex',
        name: 'Baby Alex',
        dob: '2026-08-01',
        tags: [],
        medication: [],
      });
      doc.plans['plans-base:first-aid-course'] = { doneAt: '2023-02-01' };
    });
  });
  await page.goto('/app');
  await page.getByRole('link', { name: /Review.*to check/ }).click();
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
  for (const kind of ['expiry', 'maintenance', 'age', 'recount', 'plan']) {
    await expect(page.locator(`[data-review-kind="${kind}"]`).first()).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-review-kind="expiry"] a').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goto('/app/review');
  await page.locator('[data-review-kind="maintenance"] a').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goto('/app/review');
  await page.locator('[data-review-kind="age"] a').first().click();
  await expect(page.getByRole('dialog', { name: 'Edit Baby Alex' })).toBeVisible();
  await page.goto('/app/review');
  await page.locator('[data-review-kind="recount"] a').first().click();
  await expect(page.getByText(/^Place: /)).toBeVisible();
  await page.goto('/app/review');
  await page.locator('[data-review-kind="plan"] a').first().click();
  await expect(page.getByRole('heading', { name: 'Plan to review' })).toBeVisible();
});

test('answers each kind on a phone with taps and swipe', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
  await page.goto('/?debug=1');
  await page.evaluate(async () => {
    const hook = (
      window as unknown as {
        __shtf: {
          loadFixture: () => Promise<void>;
          change: (fn: (doc: Document) => void) => Promise<void>;
        };
      }
    ).__shtf;
    await hook.loadFixture();
    await hook.change((doc) => {
      doc.household.members.push({
        id: 'baby',
        name: 'Baby',
        dob: '2026-08-01',
        tags: [],
        medication: [],
      });
      doc.plans['plans-base:first-aid-course'] = { doneAt: '2023-02-01' };
    });
  });
  await page.goto('/app/review');
  const expiry = page.locator('[data-review-kind="expiry"]').first();
  await expiry.dispatchEvent('touchstart', { touches: [{ clientX: 10 }] });
  await expiry.dispatchEvent('touchend', { changedTouches: [{ clientX: 120 }] });
  for (const [kind, action] of [
    ['maintenance', 'Done'],
    ['age', 'Noted'],
    ['recount', 'Recounted'],
    ['plan', 'Still true'],
  ]) {
    await page
      .locator(`[data-review-kind="${kind}"]`)
      .first()
      .getByRole('button', { name: new RegExp(`^${action}:`) })
      .click();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const count = await page.evaluate(
    () =>
      Object.values(
        (window as unknown as { __shtf: { doc: () => Document } }).__shtf.doc().reviews,
      ).flatMap((r) => r.resolved).length,
  );
  expect(count).toBe(5);
});
