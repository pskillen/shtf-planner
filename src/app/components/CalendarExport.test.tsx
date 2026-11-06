// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CalendarCandidate } from '../../engine';
import { calendarFile } from '../calendarExport';
import { CalendarExport } from './CalendarExport';

vi.mock('../state', () => ({ useEditable: () => true }));
vi.mock('../calendarExport', () => ({ calendarFile: vi.fn() }));
const candidates: CalendarCandidate[] = [
  {
    identity: ['review'],
    kind: 'review',
    due: '2026-01-01',
    summary: 'Household stock review',
    label: 'Household stock review',
    selectedByDefault: true,
  },
  {
    identity: ['maintenance', 'a', 'test'],
    kind: 'maintenance',
    due: '2026-04-01',
    summary: 'Alarm: Test',
    label: 'Kitchen: Test',
    selectedByDefault: false,
  },
];
const props = {
  candidates,
  createdAt: '2025-01-01T00:00:00Z',
  asOf: '2026-02-01',
  onClose: vi.fn(),
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
describe('CalendarExport', () => {
  it('defaults to review, allows selection and disables an empty download', () => {
    render(<CalendarExport {...props} />);
    const review = screen.getByRole('checkbox', { name: /Household stock review.*overdue/ });
    const job = screen.getByRole('checkbox', { name: /Kitchen: Test/ });
    expect((review as HTMLInputElement).checked).toBe(true);
    expect((job as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('1 selected')).toBeTruthy();
    fireEvent.click(review);
    expect(
      (screen.getByRole('button', { name: 'Download calendar' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(job);
    expect(screen.getByText('1 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(calendarFile).not.toHaveBeenCalled();
  });
  it('downloads once per click and prevents pending duplicate clicks', async () => {
    let resolve!: (file: string) => void;
    vi.mocked(calendarFile).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const create = vi.fn(() => 'blob:test');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<CalendarExport {...props} />);
    const button = screen.getByRole('button', { name: 'Download calendar' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(calendarFile).toHaveBeenCalledOnce();
    resolve('calendar');
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });
  it('does not download if cancelled during hashing and reports failures', async () => {
    let resolve!: (file: string) => void;
    vi.mocked(calendarFile).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const view = render(<CalendarExport {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download calendar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    view.unmount();
    resolve('calendar');
    await Promise.resolve();
    expect(click).not.toHaveBeenCalled();
    vi.mocked(calendarFile).mockRejectedValueOnce(new Error('hash failed'));
    render(<CalendarExport {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download calendar' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
