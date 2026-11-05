// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsScreen } from '../src/app/screens/SettingsScreen';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { liveStore } from './helpers/liveStore';

afterEach(cleanup);

describe('Settings, Expiry colours', () => {
  it('starts on one month and three months and writes the household settings', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<SettingsScreen />));
    const soon = screen.getByRole('radiogroup', { name: 'Expires soon within' });
    const check = screen.getByRole('radiogroup', { name: 'Next check in' });
    expect(within(soon).getByRole('radio', { name: '1 month' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(
      within(check).getByRole('radio', { name: '3 months' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(s.doc().settings.expirySoonMonths).toBeUndefined();

    fireEvent.click(within(soon).getByRole('radio', { name: '3 months' }));
    fireEvent.click(within(check).getByRole('radio', { name: '1 year' }));
    expect(s.doc().settings.expirySoonMonths).toBe(3);
    expect(s.doc().settings.expiryCheckMonths).toBe(12);
  });

  it('the check window cannot be shorter than the soon window', () => {
    const doc = biggarDocument();
    doc.settings.expiryCheckMonths = 1;
    const s = liveStore(doc);
    render(s.wrap(<SettingsScreen />));
    const soon = screen.getByRole('radiogroup', { name: 'Expires soon within' });
    fireEvent.click(within(soon).getByRole('radio', { name: '3 months' }));
    expect(s.doc().settings.expiryCheckMonths).toBe(3); // moved up with it
    const check = screen.getByRole('radiogroup', { name: 'Next check in' });
    expect(within(check).queryByRole('radio', { name: '1 month' })).toBeNull();
    expect(within(check).queryByRole('radio', { name: '2 months' })).toBeNull();
    expect(
      within(check).getByRole('radio', { name: '3 months' }).getAttribute('aria-checked'),
    ).toBe('true');
  });
});
