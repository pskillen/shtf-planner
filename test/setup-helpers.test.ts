import { describe, expect, it } from 'vitest';
import { emptyDocument, type AssetType } from '../src/model';
import { bundledPacks } from '../src/packs';
import {
  defaultAnswers,
  describeContributions,
  setAnswer,
} from '../src/app/screens/assets/questionnaire';
import {
  biggestAsks,
  previewFor,
  type HorizonPreview,
} from '../src/app/screens/horizon/previewSource';
import { applyRegion, isAllElectric, riskLinksFor } from '../src/app/screens/region';
import {
  ageInMonths,
  daysOfSupply,
  formatAge,
  formatTemp,
  formatVolume,
  suggestedAgeTags,
  today,
} from '../src/util';

describe('age', () => {
  it('counts whole months, not rounding up before the day', () => {
    expect(ageInMonths('2024-06-15', '2026-11-04')).toBe(28);
    expect(ageInMonths('2024-06-04', '2026-11-04')).toBe(29);
    expect(ageInMonths('2024-06-05', '2026-11-04')).toBe(28);
    expect(ageInMonths('2030-01-01', '2026-11-04')).toBe(0);
    expect(ageInMonths('', '2026-11-04')).toBe(0);
  });

  it('formats as months under two years, then years and months', () => {
    expect(formatAge('2026-10-01', '2026-11-04')).toBe('1 month');
    expect(formatAge('2026-08-04', '2026-11-04')).toBe('3 months');
    expect(formatAge('2024-06-01', '2026-11-04')).toBe('2 y 5 m');
    expect(formatAge('2024-11-04', '2026-11-04')).toBe('2 y');
    expect(formatAge('1984-03-12', '2026-11-04')).toBe('42 y');
  });

  it('suggests infant, child and elderly tags from the date of birth', () => {
    expect(suggestedAgeTags('2026-01-01', '2026-11-04')).toEqual(['infant']);
    expect(suggestedAgeTags('2024-11-04', '2026-11-04')).toEqual(['child']);
    expect(suggestedAgeTags('2008-11-05', '2026-11-04')).toEqual(['child']);
    expect(suggestedAgeTags('2008-11-04', '2026-11-04')).toEqual([]);
    expect(suggestedAgeTags('1961-11-04', '2026-11-04')).toEqual(['elderly']);
    expect(suggestedAgeTags('1984-03-12', '2026-11-04')).toEqual([]);
    expect(suggestedAgeTags('', '2026-11-04')).toEqual([]);
  });

  it('formats today in local time', () => {
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('days of supply', () => {
  it('divides units on hand by the daily dose, rounding down', () => {
    expect(daysOfSupply(60, 2)).toBe(30);
    expect(daysOfSupply(7, 2)).toBe(3);
    expect(daysOfSupply(0, 1)).toBe(0);
  });
  it('has no answer without a dose', () => {
    expect(daysOfSupply(10, 0)).toBeUndefined();
  });
});

describe('units', () => {
  it('shows litres in the UK and gallons in the US', () => {
    expect(formatVolume(10, 'UK')).toBe('10 L');
    expect(formatVolume(2.5, 'UK')).toBe('2.5 L');
    expect(formatVolume(10, 'US')).toBe('2.6 gal');
    expect(formatVolume(3.785411784, 'US')).toBe('1 gal');
  });
  it('shows Celsius in the UK and Fahrenheit in the US', () => {
    expect(formatTemp(18, 'UK')).toBe('18 °C');
    expect(formatTemp(0, 'US')).toBe('32 °F');
    expect(formatTemp(18, 'US')).toBe('64 °F');
  });
});

describe('the asset questionnaire', () => {
  const packs = bundledPacks();
  const solar = packs.assets['assets-base:solar-pv']!;
  const hasEps = solar.questions.find((q) => q.id === 'hasEps')!;
  const kwp = solar.questions.find((q) => q.id === 'kwp')!;
  const generator = packs.assets['assets-base:generator']!;
  const fuel = generator.questions.find((q) => q.id === 'fuel')!;

  it('starts bools off and choices on their first option, numbers unanswered', () => {
    expect(defaultAnswers(solar)).toEqual({ hasEps: false });
    expect(defaultAnswers(generator)).toEqual({ fuel: 'petrol' });
  });

  it('writes each answer with the type its question calls for', () => {
    expect(setAnswer({}, hasEps, true)).toEqual({ hasEps: true });
    expect(setAnswer({}, hasEps, 'true')).toEqual({ hasEps: true });
    expect(setAnswer({ hasEps: true }, hasEps, false)).toEqual({ hasEps: false });
    expect(setAnswer({}, kwp, 4.2)).toEqual({ kwp: 4.2 });
    expect(setAnswer({}, kwp, '3.5')).toEqual({ kwp: 3.5 });
    expect(setAnswer({}, fuel, 'lpg')).toEqual({ fuel: 'lpg' });
  });

  it('clears an answer that is empty, not a number, or not a choice on offer', () => {
    expect(setAnswer({ kwp: 4 }, kwp, undefined)).toEqual({});
    expect(setAnswer({ kwp: 4 }, kwp, '')).toEqual({});
    expect(setAnswer({ kwp: 4 }, kwp, 'lots')).toEqual({});
    expect(setAnswer({ fuel: 'petrol' }, fuel, 'diesel')).toEqual({});
  });

  it('does not change the answers it was given', () => {
    const before = { kwp: 4 };
    setAnswer(before, kwp, 5);
    expect(before).toEqual({ kwp: 4 });
  });

  it('says solar PV gives no power in an outage without EPS, and does with it', () => {
    const no = describeContributions(solar, { hasEps: false });
    expect(no).toHaveLength(1);
    expect(no[0]!.gives).toBe(false);
    expect(no[0]!.text).toMatch(/^Gives power in an outage: no, answer yes to /);
    const yes = describeContributions(solar, { hasEps: true });
    expect(yes[0]).toMatchObject({ gives: true, text: 'Gives power in an outage: yes' });
  });

  it('folds contributions to one capability into one line, and counts what applies', () => {
    const heater = packs.assets['assets-base:cabinet-heater']!;
    expect(heater.contributes.length).toBeGreaterThan(1);
    const lines = describeContributions(heater, { setting: '1.3 kW' });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.gives).toBe(true);
  });

  it('says so when a type adds nothing on its own', () => {
    const alarm = packs.assets['assets-base:smoke-alarm'] as AssetType;
    expect(describeContributions(alarm, {})).toEqual([]);
  });
});

describe('regions', () => {
  const uk = bundledPacks().regions.UK;

  it('uses SEPA for flood in Scotland and the region link elsewhere', () => {
    const scotland = riskLinksFor(uk, 'scotland').filter((l) => l.risk === 'flood');
    expect(scotland.map((l) => l.url)).toEqual(['https://map.sepa.org.uk/floodmaps/']);
    const england = riskLinksFor(uk, 'england').filter((l) => l.risk === 'flood');
    expect(england.map((l) => l.url)).toEqual([
      'https://check-long-term-flood-risk.service.gov.uk/',
    ]);
    expect(riskLinksFor(uk, undefined)).toEqual(riskLinksFor(uk, 'england'));
  });

  it('keeps the region links a subregion does not replace', () => {
    expect(riskLinksFor(uk, 'scotland').some((l) => l.risk === 'storm')).toBe(true);
  });

  it('has no links for a missing region', () => {
    expect(riskLinksFor(undefined, 'scotland')).toEqual([]);
  });

  it('keeps home and settings regions together and drops the subregion outside the UK', () => {
    const doc = emptyDocument('local');
    doc.home.subregion = 'scotland';
    applyRegion(doc, 'US');
    expect(doc.home.region).toBe('US');
    expect(doc.settings.region).toBe('US');
    expect(doc.home.subregion).toBeUndefined();
    applyRegion(doc, 'UK');
    expect(doc.settings.region).toBe('UK');
  });

  it('flags an all-electric home with no gas', () => {
    expect(isAllElectric({ heating: 'electric', cooking: 'induction', mainsGas: false })).toBe(
      true,
    );
    expect(isAllElectric({ heating: 'heat-pump', cooking: 'electric', mainsGas: false })).toBe(
      true,
    );
    expect(isAllElectric({ heating: 'electric', cooking: 'electric', mainsGas: true })).toBe(false);
    expect(isAllElectric({ heating: 'gas-boiler', cooking: 'electric', mainsGas: false })).toBe(
      false,
    );
  });
});

describe('the horizon preview', () => {
  const row = (label: string, amount: number | null, unit: string) => ({
    capability: 'water' as const,
    label,
    amount,
    unit,
    example: '',
  });
  const preview = (rows: ReturnType<typeof row>[]): HorizonPreview[] => [
    { horizonDays: 3, rows: rows.map((r) => ({ ...r, amount: r.amount && r.amount / 9 })) },
    { horizonDays: 28, rows },
  ];

  it('stubs four horizons with no amounts', () => {
    const p = previewFor(emptyDocument('local'), bundledPacks(), '2026-11-04');
    expect(p.map((x) => x.horizonDays)).toEqual([3, 7, 14, 28]);
    expect(p[0]!.rows.every((r) => r.amount === null)).toBe(true);
    expect(biggestAsks(p)).toEqual([]);
  });

  it('picks the three biggest storage amounts at the longest horizon, skipping energy', () => {
    const asks = biggestAsks(
      preview([
        row('Water', 280, 'L'),
        row('Fuel', 40, 'L'),
        row('Food', 60000, 'kcal'),
        row('Power', 9000, 'Wh'),
        row('Tins', 120, 'tins'),
        row('Gas', 6, 'canisters'),
      ]),
    );
    expect(asks).toEqual(['Water', 'Tins', 'Fuel']);
  });
});
