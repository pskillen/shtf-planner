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

test('sheet buttons keep their gap, and a lone Save is full width', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.evaluate(() =>
    (window as unknown as { __shtf: { loadFixture: () => Promise<void> } }).__shtf.loadFixture(),
  );
  await page.goto('/app/people');
  await page.getByRole('button', { name: 'Edit Pat' }).click();
  const del = (await page.getByRole('button', { name: 'Delete' }).boundingBox())!;
  const save = (await page.getByRole('button', { name: 'Save' }).boundingBox())!;
  expect(save.x - (del.x + del.width)).toBeGreaterThanOrEqual(8);
  await page.goBack();
  await page.getByRole('button', { name: 'Add a person' }).click();
  const lone = (await page.getByRole('button', { name: 'Save' }).boundingBox())!;
  const sheet = (await page.getByRole('dialog').boundingBox())!;
  expect(lone.width).toBeGreaterThan(sheet.width - 40);
});

test('a 60-character name does not widen the page', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.evaluate(() =>
    (window as unknown as { __shtf: { loadFixture: () => Promise<void> } }).__shtf.loadFixture(),
  );
  await page.evaluate(() =>
    (
      window as unknown as {
        __shtf: {
          change: (fn: (d: { household: { members: { name: string }[] } }) => void) => void;
        };
      }
    ).__shtf.change((d) => {
      d.household.members[0]!.name = 'A'.repeat(60);
    }),
  );
  await page.goto('/app/people');
  await expect(page.getByRole('button', { name: /^Edit AAAA/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('an unreadable household shows the banner with a 44 px link, not a blank page', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await page.evaluate(() =>
    (window as unknown as { __shtf: { loadFixture: () => Promise<void> } }).__shtf.loadFixture(),
  );
  await page.evaluate(() =>
    (
      window as unknown as {
        __shtf: { change: (fn: (d: { home: { heating: string } }) => void) => void };
      }
    ).__shtf.change((d) => {
      d.home.heating = 'bogus';
    }),
  );
  await page.goto('/app');
  await expect(page.getByRole('alert').first()).toContainText('could not be read');
  await expect(page.getByRole('heading', { name: 'Your household' })).toBeVisible();
  const link = page.getByRole('link', { name: /Go to More/ });
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('an expanded item in Stores keeps its title on one wide row, with the panel beneath', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await page.evaluate(() =>
    (window as unknown as { __shtf: { loadFixture: () => Promise<void> } }).__shtf.loadFixture(),
  );
  await page.goto('/app/stores');

  const row = page.locator('li.row-item-stack').first();
  const title = row.locator('button.row-main').first();
  await title.click();
  await expect(title).toHaveAttribute('aria-expanded', 'true');
  const t = (await title.boundingBox())!;
  const r = (await row.boundingBox())!;
  expect(t.width).toBeGreaterThan(r.width / 2);
  expect(t.height).toBeLessThan(120);
});
