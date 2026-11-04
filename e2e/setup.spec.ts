import { expect, test, type Page } from '@playwright/test';

type Shtf = {
  doc: () => Promise<{
    household: {
      members: { name: string; tags: string[]; medication: { unitsOnHand: number }[] }[];
    };
    home: { heating: string; risks: string[] };
    locations: Record<string, { name: string }>;
    assets: Record<string, { typeId: string; answers: Record<string, unknown> }>;
    settings: { horizonDays: number };
  }>;
  loadFixture: () => Promise<void>;
  flush: () => Promise<void>;
};
const doc = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.doc());

/** A date `months` months before today, as YYYY-MM-DD (for an infant). */
function monthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test('a fresh household completes onboarding by hand and it survives a reload', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await page.getByRole('link', { name: 'Start' }).click();

  // People: two, one an infant (the tag follows the date of birth).
  await expect(page.getByText('Step 1 of 4: People')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  await page.getByRole('button', { name: 'Add a person' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Alex');
  await page.getByLabel('Date of birth').fill('1984-03-12');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Add a person' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Jo');
  await page.getByLabel('Date of birth').fill(monthsAgo(3));
  await expect(page.getByRole('button', { name: 'Infant', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Edit Jo' })).toContainText('3 months');
  await page.getByRole('button', { name: 'Next' }).click();

  // Home.
  await expect(page.getByText('Step 2 of 4: Home')).toBeVisible();
  // Nothing is answered for you: the questions start on Choose, and Next waits for all four.
  await expect(page.getByLabel('How is the house heated?')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  await page.getByLabel('What kind of home is it?').selectOption('semi');
  await page.getByLabel('How is the house heated?').selectOption('electric');
  await page.getByLabel('How do you cook?').selectOption('induction');
  await page.getByLabel('Which part of the UK?').selectOption('england');
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  await expect(page.getByRole('radio', { name: 'Yes', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await page.getByRole('radio', { name: 'No', exact: true }).click();
  await expect(page.getByText('this home has no heat or cooking', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // Back keeps the four answers and Next stays on.
  await expect(page.getByText('Step 3 of 4: Risks')).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByLabel('How is the house heated?')).toHaveValue('electric');
  await expect(page.getByRole('radio', { name: 'No', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
  await page.getByRole('button', { name: 'Next' }).click();

  // Risks.
  await expect(page.getByText('Step 3 of 4: Risks')).toBeVisible();
  await page.getByRole('button', { name: 'Power cuts' }).click();
  await page.getByRole('button', { name: 'Flooding' }).click();
  await expect(page.getByRole('link', { name: /Environment Agency/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // Horizon: 14 days; the finish lands on the Score tab, and the Home tab is the hub.
  await expect(page.getByText('Step 4 of 4')).toBeVisible();
  await page.getByRole('radio', { name: '14 days' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: 'Score' })).toBeVisible();
  await expect(page.getByText('at 14 days')).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { name: 'Your household' })).toBeVisible();

  // Three locations from the suggestions.
  await page.getByRole('link', { name: /^Locations/ }).click();
  for (const name of ['Pantry', 'Garage', 'Shed']) {
    await page.getByRole('button', { name: `+ ${name}` }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: `Edit ${name}` })).toBeVisible();
  }
  await page.getByRole('link', { name: /Home/ }).first().click();

  // One asset: solar PV without an emergency supply.
  await page.getByRole('link', { name: /^Equipment/ }).click();
  await page.getByRole('button', { name: 'Add equipment' }).click();
  await page.getByLabel('Search equipment').fill('solar');
  await page.getByRole('button', { name: /Solar PV array/ }).click();
  await expect(page.getByText(/Gives power in an outage: no/)).toBeVisible();
  await page.getByLabel('Array size?').fill('4');
  await page.getByLabel('Where is it kept?').selectOption({ label: 'Garage' });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Edit Solar PV array' })).toBeVisible();

  // Reload: the hub shows the counts. Wait for IndexedDB first; a reload in the same millisecond
  // as a tap is faster than any person.
  await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.flush());
  await page.goto('/app?debug=1');
  await expect(page.getByRole('link', { name: /^People/ })).toContainText('2 people');
  await expect(page.getByRole('link', { name: /^Locations/ })).toContainText('3 places');
  await expect(page.getByRole('link', { name: /^Equipment/ })).toContainText('1 item');
  await expect(page.getByRole('link', { name: /^Risks/ })).toContainText('Power cuts');
  await expect(page.getByRole('link', { name: /^How long/ })).toContainText('14 days');

  const d = await doc(page);
  expect(d.household.members.map((m) => [m.name, m.tags])).toEqual([
    ['Alex', []],
    ['Jo', ['infant']],
  ]);
  expect(d.home.heating).toBe('electric');
  expect([...d.home.risks].sort()).toEqual(['flood', 'grid']); // the store keeps value lists as sets
  expect(d.settings.horizonDays).toBe(14);
  expect(Object.values(d.locations).map((l) => l.name)).toEqual(['Pantry', 'Garage', 'Shed']);
  const [asset] = Object.values(d.assets);
  expect(asset).toMatchObject({
    typeId: 'assets-base:solar-pv',
    answers: { kwp: 4, hasEps: false },
  });
});

test('the fixture household: edit a medication, and delete with undo', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.loadFixture());
  await page.goto('/app/people?debug=1');

  await page.getByRole('button', { name: 'Edit Pat' }).click();
  await expect(page.getByText('21 days of supply')).toBeVisible();
  await page.getByLabel('Units on hand for Ramipril').fill('42');
  await expect(page.getByText('42 days of supply')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect
    .poll(async () => (await doc(page)).household.members[4]!.medication[0]!.unitsOnHand)
    .toBe(42);

  // Delete Robin, then undo within the five seconds.
  await page.getByRole('button', { name: 'Edit Robin' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('button', { name: 'Edit Robin' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Edit Robin' })).toBeVisible();
  expect((await doc(page)).household.members.map((m) => m.name)).toContain('Robin');

  // Delete him again and let the toast run out: the delete lands.
  await page.getByRole('button', { name: 'Edit Robin' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect
    .poll(async () => (await doc(page)).household.members.map((m) => m.name), { timeout: 10_000 })
    .not.toContain('Robin');
});
