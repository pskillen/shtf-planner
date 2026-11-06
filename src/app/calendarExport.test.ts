import { webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { CalendarCandidate } from '../engine';
import { calendarFile } from './calendarExport';

vi.stubGlobal('crypto', webcrypto);
describe('calendarFile', () => {
  it('keeps private labels and ids out, and retains identity across date edits', async () => {
    const candidate: CalendarCandidate = {
      identity: ['maintenance', 'private-id', 'test'],
      kind: 'maintenance',
      due: '2026-03-01',
      summary: 'Smoke alarm: Test',
      label: 'Private kitchen: Test',
      selectedByDefault: false,
    };
    const file = await calendarFile('2025-01-01T00:00:00Z', [candidate], '2026-01-01T00:00:00Z');
    const later = await calendarFile(
      '2025-01-01T00:00:00Z',
      [{ ...candidate, due: '2026-04-01' }],
      '2026-01-01T00:00:00Z',
    );
    expect(file).not.toContain('private-id');
    expect(file).not.toContain('Private kitchen');
    expect(file).toContain('SUMMARY:Smoke alarm: Test');
    expect(file.match(/UID:.*\r\n/)?.[0]).toBe(later.match(/UID:.*\r\n/)?.[0]);
  });
});
