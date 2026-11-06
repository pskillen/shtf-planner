import { expect, test, type Page } from '@playwright/test';

type Shtf = {
  doc: () => Promise<{
    products: Record<string, { id: string; name: string; itemId?: string }>;
    stock: Record<string, { productId: string; qty: number }>;
  }>;
  loadFixture: () => Promise<void>;
};

const doc = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.doc());

async function fixture(page: Page, path = '/app/stores'): Promise<void> {
  await page.goto('/?debug=1');
  await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.loadFixture());
  await page.goto(`${path}?debug=1`);
}

async function quickAddBeans220(page: Page, packs: number): Promise<void> {
  await page.getByRole('button', { name: 'Add stock' }).click();
  await page.getByRole('searchbox', { name: 'What are you adding?' }).fill('baked');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Baked beans (?!\d)/ })
    .click();
  await page
    .getByRole('region', { name: 'Suggested sizes' })
    .getByRole('button', { name: '220 g' })
    .click();
  for (let i = 1; i < packs; i++) {
    await page.getByRole('button', { name: /^One more: How many/ }).click();
  }
  await page.getByRole('button', { name: 'Add', exact: true }).click();
}

function product220(d: Awaited<ReturnType<typeof doc>>) {
  return Object.values(d.products).find(
    (p) => p.itemId === 'items-base:baked-beans' && p.name === 'Baked beans 220 g',
  );
}

test('items, products and batches through quick add, the product list and Stores', async ({
  page,
}) => {
  await fixture(page);

  await quickAddBeans220(page, 2);
  let d = await doc(page);
  const p220 = product220(d);
  expect(p220).toBeDefined();
  const stock220 = Object.values(d.stock).find((s) => s.productId === p220!.id);
  expect(stock220?.qty).toBe(2);

  await page.getByRole('button', { name: 'Close' }).click();
  await quickAddBeans220(page, 1);
  d = await doc(page);
  expect(
    Object.values(d.products).filter(
      (p) => p.itemId === 'items-base:baked-beans' && p.name === 'Baked beans 220 g',
    ),
  ).toHaveLength(1);

  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('link', { name: 'Your products' }).click();
  await page.getByRole('button', { name: /Baked beans 220 g/ }).click();
  await page.getByLabel('Name').fill('Small beans 220 g');
  await page.getByRole('button', { name: 'Save name' }).click();
  await page.getByRole('button', { name: 'Merge into…' }).click();
  const mergeDlg = page.getByRole('dialog', { name: 'Merge into…' });
  await mergeDlg
    .getByRole('button', { name: /Test beans 415 g/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Merge' }).click();

  d = await doc(page);
  expect(product220(d)).toBeUndefined();
  expect(d.products['prod-beans']).toBeDefined();
  expect(
    Object.values(d.stock).filter((s) => s.productId === 'prod-beans' && s.qty === 3),
  ).toHaveLength(1);

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Stores' })
    .click();
  await page.getByRole('button', { name: /Baked beans ·/ }).click();
  await page
    .getByRole('button', { name: /Edit .*Test beans 415 g/ })
    .first()
    .click();
  const fewer = page.getByRole('button', { name: /^One fewer: How many/ });
  for (let i = 0; i < 10; i++) await fewer.click();
  await page.getByRole('radio', { name: '½' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('2½')).toBeVisible();

  await expect(page.getByText('min 6 in Pantry')).toBeVisible();
  const useFirstRow = page
    .getByRole('button', { name: /Edit .*Test beans 415 g in Pantry/ })
    .filter({ hasText: 'Jun 2028' });
  await expect(useFirstRow.getByText('Use first')).toBeVisible();
  await expect(page.getByText('Use first').first()).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Gaps' }).click();
  await page.getByRole('radio', { name: 'By aisle' }).click();
  await expect(page.getByRole('heading', { name: 'Food and cooking › Tins' })).toBeVisible();
});
