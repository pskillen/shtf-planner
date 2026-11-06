import { describe, expect, it } from 'vitest';
import { biggarDocument } from '../fixtures/household-biggar';
import { bundledPacks } from '../packs/bundled';
import { maintenanceDue } from './maintenance';

const packs = bundledPacks();

describe('maintenanceDue', () => {
  it('uses the authoritative schedule and returns future and due jobs', () => {
    const doc = biggarDocument();
    doc.assets = {
      a: {
        id: 'a',
        typeId: 'assets-base:smoke-alarm',
        answers: {},
        maintenance: { test: '2026-01-31', obsolete: '2020-01-01' },
      },
    };
    const jobs = maintenanceDue(doc, packs, '2026-02-28');
    expect(jobs.find((j) => j.jobId === 'test')).toMatchObject({
      lastDone: '2026-01-31',
      due: '2026-02-28',
      overdue: false,
    });
    expect(jobs.some((j) => j.jobId === 'obsolete')).toBe(false);
    expect(jobs.find((j) => j.jobId !== 'test')).toMatchObject({
      due: '2026-02-28',
      overdue: false,
    });
    doc.assets.a!.purchased = '2026-01-31';
    expect(maintenanceDue(doc, packs, '2026-02-01').find((j) => j.jobId === 'test')).toMatchObject({
      due: '2026-02-28',
      overdue: false,
    });
    expect(maintenanceDue(doc, packs, '2026-02-01').find((j) => j.jobId !== 'test')?.due).toBe(
      '2036-01-31',
    );
    expect(maintenanceDue(doc, packs, '2026-03-01').find((j) => j.jobId === 'test')?.overdue).toBe(
      true,
    );
    doc.assets.a!.typeId = 'assets-base:rocket-stove';
    expect(maintenanceDue(doc, packs, '2026-02-01')).toEqual([]);
    doc.assets.a!.typeId = 'unknown';
    expect(maintenanceDue(doc, packs, '2026-02-01')).toEqual([]);
  });
});
