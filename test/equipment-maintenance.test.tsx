// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AssetsScreen } from '../src/app/screens/AssetsScreen';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { SchemaTooNewError } from '../src/model';
import { today } from '../src/util';
import { liveStore } from './helpers/liveStore';

afterEach(cleanup);
it('records maintenance immediately and preserves intervening changes on save', () => {
  const doc = biggarDocument();
  doc.assets.alarm = {
    id: 'alarm',
    typeId: 'assets-base:smoke-alarm',
    answers: {},
    maintenance: {},
  };
  const s = liveStore(doc);
  render(s.wrap(<AssetsScreen />));
  fireEvent.click(screen.getByRole('button', { name: 'Edit Smoke alarm' }));
  const dialog = within(screen.getByRole('dialog'));
  fireEvent.click(dialog.getAllByRole('button', { name: 'Done today' })[0]!);
  expect(s.doc().assets.alarm!.maintenance.test).toBe(today());
  expect(dialog.getByRole('status').textContent).toBe('Saved');
  fireEvent.change(dialog.getByLabelText('Last done: Press the test button'), {
    target: { value: '2020-03-03' },
  });
  expect(s.doc().assets.alarm!.maintenance.test).toBe('2020-03-03');
  fireEvent.change(dialog.getByLabelText('Notes'), { target: { value: 'My note' } });
  act(() =>
    s.store.change('concurrent change', (d) => {
      d.assets.alarm!.name = 'Hall alarm';
    }),
  );
  fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
  expect(s.doc().assets.alarm).toMatchObject({
    name: 'Hall alarm',
    notes: 'My note',
    maintenance: { test: '2020-03-03' },
  });
  expect(
    within(screen.getByRole('button', { name: 'Edit Hall alarm' })).getByText('Maintenance due'),
  ).toBeTruthy();
});

it('leaves maintenance controls disabled in a read-only household', () => {
  const s = liveStore(biggarDocument());
  const status = {
    kind: 'too-new' as const,
    found: 99,
    supported: 1,
    error: new SchemaTooNewError(99, 1),
  };
  s.store.status = () => status;
  render(s.wrap(<AssetsScreen />));
  fireEvent.click(screen.getByRole('button', { name: 'Edit Hall smoke alarm' }));
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.getAllByRole('button', { name: 'Done today' })[0]!.matches(':disabled')).toBe(true);
  expect(dialog.getByLabelText('Last done: Press the test button').matches(':disabled')).toBe(true);
  expect(dialog.getByRole('button', { name: 'Save' }).matches(':disabled')).toBe(true);
});

it('removes a cleared equipment answer and preserves an unrelated intervening answer', () => {
  const doc = biggarDocument();
  doc.assets.station = {
    id: 'station',
    typeId: 'assets-base:power-station',
    answers: { wh: 500 },
    maintenance: {},
  };
  const s = liveStore(doc);
  render(s.wrap(<AssetsScreen />));
  fireEvent.click(screen.getByRole('button', { name: 'Edit Portable power station' }));
  const dialog = within(screen.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText(/Capacity/), { target: { value: '' } });
  act(() =>
    s.store.change('concurrent change', (d) => {
      d.assets.station!.answers.other = 10;
    }),
  );
  fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
  expect(s.doc().assets.station!.answers).toEqual({ other: 10 });
});
