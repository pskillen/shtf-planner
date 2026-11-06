import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('exports only explicitly selected reminders on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
  const external: string[] = [];
  page.on('request', (request) => {
    if (!new URL(request.url()).origin.includes('127.0.0.1') && !request.url().startsWith('blob:'))
      external.push(request.url());
  });
  await page.goto('/?debug=1');
  await page.evaluate(() =>
    (window as unknown as { __shtf: { loadFixture: () => Promise<void> } }).__shtf.loadFixture(),
  );
  await page.goto('/app/review');
  await page.getByRole('button', { name: 'Add to calendar' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('1 selected')).toBeVisible();
  const checks = dialog.getByRole('checkbox');
  expect(await checks.count()).toBeGreaterThan(1);
  await checks.nth(1).check();
  await expect(dialog.getByText('2 selected')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download calendar' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('shtf-planner.ics');
  const contents = await readFile((await download.path())!, 'utf8');
  expect(contents.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  expect(contents).toContain('SUMMARY:Household stock review');
  expect(external).toEqual([]);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForFunction(() => !window.history.state?.sheet);
  await page.goto('/app/more/settings');
  await page.getByRole('button', { name: 'Add to calendar' }).click();
  await expect(page.getByRole('dialog').getByText('1 selected')).toBeVisible();
});
