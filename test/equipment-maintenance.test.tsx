// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AssetsScreen } from '../src/app/screens/AssetsScreen';
import { biggarDocument } from '../src/fixtures/household-biggar';
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
