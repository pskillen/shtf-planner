import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { parse, stringify } from 'yaml';
import { createBackend, installFakeGoogle, type Backend } from './fakeGoogle';

type Shtf = {
  doc: () => Promise<{ household: { members: { name: string }[] }; home: { area?: string } }>;
  loadFixture: () => Promise<void>;
  change: (fn: (d: { home: { area?: string } }) => void) => Promise<void>;
  flush: () => Promise<void>;
};
type Win = { __shtf: Shtf };

const names = (page: Page) =>
  page.evaluate(async () =>
    (await (window as unknown as Win).__shtf.doc()).household.members.map((m) => m.name),
  );
const area = (page: Page) =>
  page.evaluate(async () => (await (window as unknown as Win).__shtf.doc()).home.area);
const setArea = (page: Page, value: string) =>
  page.evaluate(
    (v) =>
      (window as unknown as Win).__shtf.change((d) => {
        d.home.area = v;
      }),
    value,
  );
const flush = (page: Page) => page.evaluate(() => (window as unknown as Win).__shtf.flush());
const pill = (page: Page) => page.getByTestId('sync-pill');

/** A device: its own browser context (own IndexedDB), the fake Google, the Data screen. */
async function device(
  browser: import('@playwright/test').Browser,
  backend: Backend,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  await installFakeGoogle(context, backend);
  const page = await context.newPage();
  await page.goto('/app/more/data?debug=1');
  await expect(page.getByRole('heading', { name: 'Data', exact: true })).toBeVisible();
  return { context, page };
}

test('connect, push, and a second device pulls the household', async ({ browser }) => {
  const backend = createBackend();
  const a = await device(browser, backend);
  await expect(pill(a.page)).toHaveAttribute('data-status', 'disconnected');

  await a.page.evaluate(() => (window as unknown as Win).__shtf.loadFixture());
  await a.page.getByRole('button', { name: 'Connect Google Drive' }).click();
  await expect(pill(a.page)).toHaveAttribute('data-status', 'synced');
  await expect(a.page.getByTestId('data-status')).toContainText('e2e@example.test');

  // Both files are in the SHTF Planner folder.
  const yjs = backend.byName('household.yjs');
  const sidecar = backend.byName('household.json');
  expect(yjs?.data.length).toBeGreaterThan(1000);
  expect(JSON.parse(sidecar!.data.toString('utf8')).household.members).toHaveLength(5);
  expect(backend.byName('SHTF Planner')?.mimeType).toBe('application/vnd.google-apps.folder');

  // Another browser profile, same account: connecting loads the household.
  const b = await device(browser, backend);
  expect(await names(b.page)).toEqual([]);
  await b.page.getByRole('button', { name: 'Connect Google Drive' }).click();
  await expect(pill(b.page)).toHaveAttribute('data-status', 'synced');
  await expect.poll(() => names(b.page)).toEqual(['Alex', 'Sam', 'Robin', 'Jo', 'Pat']);
  await expect(b.page.getByTestId('sync-toast')).toContainText('Loaded your household');

  // It found the same folder rather than making a second one.
  const folders = Array.from(backend.files.values()).filter((f) => f.name === 'SHTF Planner');
  expect(folders).toHaveLength(1);
  await a.context.close();
  await b.context.close();
});

test('an edit on one device reaches the other when it looks again', async ({ browser }) => {
  const backend = createBackend();
  const a = await device(browser, backend);
  await a.page.evaluate(() => (window as unknown as Win).__shtf.loadFixture());
  await a.page.getByRole('button', { name: 'Connect Google Drive' }).click();
  await expect(pill(a.page)).toHaveAttribute('data-status', 'synced');
  const b = await device(browser, backend);
  await b.page.getByRole('button', { name: 'Connect Google Drive' }).click();
  await expect(pill(b.page)).toHaveAttribute('data-status', 'synced');

  await setArea(a.page, 'ML12 (edited on a)');
  await expect(pill(a.page)).toHaveAttribute('data-status', 'pending');
  await flush(a.page);
  await expect(pill(a.page)).toHaveAttribute('data-status', 'synced');

  await b.page.getByRole('button', { name: 'Check Drive' }).click();
  await expect.poll(() => area(b.page)).toBe('ML12 (edited on a)');
  await expect(b.page.getByTestId('sync-toast')).toContainText('from your other device');
  await a.context.close();
  await b.context.close();
});

test('the same field edited on both devices asks which copy to keep', async ({ browser }) => {
  const backend = createBackend();
  const a = await device(browser, backend);
  await a.page.evaluate(() => (window as unknown as Win).__shtf.loadFixture());
  await a.page.getByRole('button', { name: 'Connect Google Drive' }).click();
  await expect(pill(a.page)).toHaveAttribute('data-status', 'synced');
  const b = await device(browser, backend);
  await b.page.getByRole('button', { name: 'Connect Google Drive' }).click();
  await expect(pill(b.page)).toHaveAttribute('data-status', 'synced');

  await setArea(a.page, 'edited on A');
  await flush(a.page);
  await setArea(b.page, 'edited on B');
  await flush(b.page); // looks at Drive first, finds A's edit, and asks

  const dialog = b.page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Your home');
  await expect(dialog).toContainText('edited on A');
  await expect(dialog).toContainText('edited on B');
  await expect(pill(b.page)).toHaveAttribute('data-status', 'remoteNewer');

  await dialog.getByRole('button', { name: 'Take theirs' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => area(b.page)).toBe('edited on A');
  await expect(pill(b.page)).toHaveAttribute('data-status', 'synced');

  await a.page.getByRole('button', { name: 'Check Drive' }).click();
  await expect(pill(a.page)).toHaveAttribute('data-status', 'synced');
  expect(await area(a.page)).toBe('edited on A');
  await a.context.close();
  await b.context.close();
});

test('closing the Google popup is quiet and the retry works', async ({ browser }) => {
  const backend = createBackend();
  const a = await device(browser, backend);
  await a.page.getByRole('button', { name: 'Connect Google Drive' }).click(); // loads the stub
  await expect(pill(a.page)).toHaveAttribute('data-status', 'synced');
  await a.page.getByRole('button', { name: 'Disconnect' }).click();
  await a.page.getByRole('button', { name: 'Yes, disconnect' }).click();
  await expect(pill(a.page)).toHaveAttribute('data-status', 'disconnected');

  await a.page.evaluate(() => {
    (window as unknown as { __gis: { closeNext: boolean } }).__gis.closeNext = true;
  });
  await a.page.getByRole('button', { name: 'Connect Google Drive' }).click();
  await expect(pill(a.page)).toHaveAttribute('data-status', 'disconnected');
  await expect(a.page.getByRole('alert')).toHaveCount(0);

  await a.page.getByRole('button', { name: 'Connect Google Drive' }).click();
  await expect(pill(a.page)).toHaveAttribute('data-status', 'synced');
  await a.context.close();
});

test('the pill is on every app screen and opens the Data screen', async ({ page }) => {
  await page.goto('/app/stores');
  await expect(pill(page)).toBeVisible();
  await pill(page).click();
  await expect(page).toHaveURL(/\/app\/more\/data$/);
  await expect(page.getByRole('heading', { name: 'Data', exact: true })).toBeVisible();
  // More lists Data
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click();
  await expect(page.getByRole('link', { name: /^Data/ })).toBeVisible();
});

test('export downloads JSON and YAML; importing YAML replaces the household and reaches Drive', async ({
  browser,
}) => {
  const backend = createBackend();
  const { context, page } = await device(browser, backend);
  await page.evaluate(() => (window as unknown as Win).__shtf.loadFixture());
  await page.getByRole('button', { name: 'Connect Google Drive' }).click();
  await expect(pill(page)).toHaveAttribute('data-status', 'synced');

  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download JSON' }).click(),
  ]);
  expect(jsonDownload.suggestedFilename()).toMatch(/^household-local-\d{4}-\d{2}-\d{2}\.json$/);
  const jsonPath = await jsonDownload.path();
  const { readFileSync } = await import('node:fs');
  const exported = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
    household: { members: { name: string }[] };
    home: { area: string };
  };
  expect(exported.household.members.map((m) => m.name)).toContain('Alex');

  const [yamlDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download YAML' }).click(),
  ]);
  expect(yamlDownload.suggestedFilename()).toMatch(/^household-local-\d{4}-\d{2}-\d{2}\.yaml$/);
  const yaml = readFileSync(await yamlDownload.path(), 'utf8');
  expect(yaml).toContain('schemaVersion: 1');
  expect(yaml).toContain('name: Alex');

  // Import: a smaller household, from the YAML export edited, replaces the loaded one.
  const edited = parse(yaml) as typeof exported;
  edited.household.members = edited.household.members.slice(0, 2);
  edited.home.area = 'Imported';
  await page.getByLabel('Choose an export file').setInputFiles({
    name: 'household.yaml',
    mimeType: 'application/yaml',
    buffer: Buffer.from(stringify(edited)),
  });
  await expect(page.getByTestId('import-preview')).toContainText('2 people');
  await expect(page.getByTestId('import-preview')).toContainText(
    'last written by local; you are on local',
  );
  await page.getByRole('button', { name: 'Replace my plan' }).click();
  await expect(page.getByTestId('import-done')).toBeVisible();
  expect(await names(page)).toHaveLength(2);
  expect(await area(page)).toBe('Imported');

  // ...and the import is pushed: the sidecar on the fake Drive is the imported household.
  const pushed = () =>
    JSON.parse(backend.byName('household.json')!.data.toString('utf8')) as typeof exported;
  await expect.poll(() => pushed().home.area, { timeout: 20_000 }).toBe('Imported');
  expect(pushed().household.members).toHaveLength(2);
  await expect(pill(page)).toHaveAttribute('data-status', 'synced');
  await context.close();
});

test('forgetting this device deletes the household here and leaves Drive alone', async ({
  browser,
}) => {
  const backend = createBackend();
  const a = await device(browser, backend);
  await a.page.evaluate(() => (window as unknown as Win).__shtf.loadFixture());
  await a.page.getByRole('button', { name: 'Connect Google Drive' }).click();
  await expect(pill(a.page)).toHaveAttribute('data-status', 'synced');
  const filesBefore = backend.files.size;

  await a.page.getByRole('button', { name: /^Forget this device/ }).click();
  await a.page.getByRole('button', { name: 'Yes, delete it from this device' }).click();
  await a.page.waitForURL(/\/app\/more\/data$/);
  await expect(a.page.getByRole('heading', { name: 'Data', exact: true })).toBeVisible();
  await a.page.goto('/app/more/data?debug=1');
  await expect(a.page.getByRole('heading', { name: 'Data', exact: true })).toBeVisible();
  await expect
    .poll(() => a.page.evaluate(() => typeof (window as unknown as Win).__shtf))
    .toBe('object');
  expect(await names(a.page)).toEqual([]);
  await expect(pill(a.page)).toHaveAttribute('data-status', 'disconnected');
  expect(backend.files.size).toBe(filesBefore);
  await a.context.close();
});
