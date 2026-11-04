// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Toast } from '../src/app/components/Toast';

afterEach(cleanup);

describe('the toast region', () => {
  it('draws every toast into the one region, in order, whatever is showing', () => {
    const { rerender } = render(
      <>
        <Toast testId="sync">Synced</Toast>
        <Toast className="toast-update">Update available</Toast>
        <Toast>Deleted</Toast>
      </>,
    );
    const regions = document.querySelectorAll('.toast-region');
    expect(regions.length).toBe(1);
    expect([...regions[0]!.children].map((c) => c.textContent)).toEqual([
      'Synced',
      'Update available',
      'Deleted',
    ]);
    expect(screen.getAllByRole('status').length).toBe(3);

    // a toast that goes leaves no gap: the others are still there, the same region
    rerender(
      <>
        <Toast testId="sync">Synced</Toast>
        <Toast>Deleted</Toast>
      </>,
    );
    expect(document.querySelectorAll('.toast-region').length).toBe(1);
    expect(regions[0]!.children.length).toBe(2);
  });
});
