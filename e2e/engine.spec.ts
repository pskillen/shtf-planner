import { expect, test } from '@playwright/test';

type Shtf = {
  loadFixture: () => Promise<void>;
  engine: {
    score: (asOf?: string, horizonDays?: number) => Promise<{ weakest: string; overall: number }>;
    gaps: (
      asOf?: string,
      horizonDays?: number,
    ) => Promise<{ kind: string; capability: string; suggestions: { label: string }[] }[]>;
    review: (asOf?: string) => Promise<{ kind: string; due: string }[]>;
    preview: (asOf?: string) => Promise<{ horizonDays: number }[]>;
  };
};

test('the engine runs on the live document: heat is the weakest for the fixture household', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.loadFixture());

  const score = await page.evaluate(() =>
    (window as unknown as { __shtf: Shtf }).__shtf.engine.score('2026-11-15', 3),
  );
  expect(score.weakest).toBe('heat');
  expect(score.overall).toBeGreaterThan(0);

  const gaps = await page.evaluate(() =>
    (window as unknown as { __shtf: Shtf }).__shtf.engine.gaps('2026-11-15', 3),
  );
  expect(
    gaps.some((g) => g.kind === 'task' && g.suggestions[0]?.label.startsWith('Fit an EPS')),
  ).toBe(true);

  const preview = await page.evaluate(() =>
    (window as unknown as { __shtf: Shtf }).__shtf.engine.preview('2026-11-15'),
  );
  expect(preview.map((p) => p.horizonDays)).toEqual([3, 7, 14, 28]);
});

test('review debug hook returns the fixture queue', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.evaluate(() => (window as unknown as { __shtf: Shtf }).__shtf.loadFixture());
  const review = await page.evaluate(() =>
    (window as unknown as { __shtf: Shtf }).__shtf.engine.review('2026-11-15'),
  );
  expect(review.some((item) => item.kind === 'maintenance')).toBe(true);
  expect(review.some((item) => item.kind === 'recount')).toBe(true);
});
