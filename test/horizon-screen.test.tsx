// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HorizonScreen } from '../src/app/screens/HorizonScreen';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { liveStore } from './helpers/liveStore';

afterEach(cleanup);

describe('the horizon table', () => {
  it('says what a hand clean is under the hygiene row, in hand cleans', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<HorizonScreen />));
    const row = screen.getByRole('rowheader', { name: /Hygiene supplies/ });
    expect(row.textContent).toContain('A hand clean is 1 wipe or 5 ml of hand sanitiser.');
    expect(row.closest('tr')!.textContent).toMatch(/hand cleans/);
    expect(row.closest('tr')!.textContent).not.toMatch(/\buses\b/);
  });
});
