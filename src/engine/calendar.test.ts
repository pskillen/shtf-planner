import { describe, expect, it } from 'vitest';
import { emptyDocument } from '../model';
import { bundledPacks } from '../packs/bundled';
import { calendarCandidates } from './calendar';

const packs = bundledPacks();
describe('calendarCandidates', () => {
  it('offers the overdue review and one next occurrence for each eligible job independently of review answers', () => {
    const doc = emptyDocument('local', '2025-01-01T00:00:00Z');
    doc.assets = {
      one: {
        id: 'one',
        typeId: 'assets-base:smoke-alarm',
        name: 'Private kitchen',
        purchased: '2026-01-01',
        answers: {},
        maintenance: { test: '2026-02-01' },
      },
      two: {
        id: 'two',
        typeId: 'assets-base:smoke-alarm',
        purchased: '2026-01-01',
        answers: {},
        maintenance: { test: '2026-02-01' },
      },
    };
    doc.reviews = {
      open: { id: 'open', started: '2026-02-01T00:00:00Z', resolved: ['maint:one:test'] },
    };
    const candidates = calendarCandidates(doc, packs, '2026-02-15');
    expect(candidates[0]).toMatchObject({ due: '2025-07-01', selectedByDefault: true });
    const jobs = candidates.filter((c) => c.kind === 'maintenance');
    expect(jobs).toHaveLength(2);
    expect(jobs.every((c) => c.due === '2026-03-01' && !c.selectedByDefault)).toBe(true);
    expect(jobs[0]?.label).toContain('Private kitchen');
    expect(jobs[0]?.summary).not.toContain('Private kitchen');
    expect(jobs.map((c) => c.identity)).toEqual([
      ['maintenance', 'one', 'test'],
      ['maintenance', 'two', 'test'],
    ]);
    doc.assets.one!.maintenance.test = '2027-01-01';
    expect(
      calendarCandidates(doc, packs, '2026-02-15').filter((c) => c.kind === 'maintenance'),
    ).toHaveLength(1);
  });
});
