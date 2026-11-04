// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoresScreen } from '../src/app/screens/StoresScreen';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { liveStore } from './helpers/liveStore';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const edit = () => screen.getByRole('button', { name: 'Edit Water can (10 L)' });

describe('the Stores edit sheet', () => {
  it('saves a new quantity', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StoresScreen />));
    fireEvent.click(edit());
    fireEvent.click(screen.getByRole('button', { name: /^One more: / }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(s.doc().items['item-water']!.qty).toBe(3);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('stops the stepper at one: deleting is the way to zero', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StoresScreen />));
    fireEvent.click(edit());
    const fewer = screen.getByRole('button', { name: /^One fewer: / });
    fireEvent.click(fewer);
    expect((screen.getByLabelText(/, number$/) as HTMLInputElement).value).toBe('1');
    expect((fewer as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(s.doc().items['item-water']!.qty).toBe(1);
  });

  it('Delete hides the row with an undo toast and removes it after five seconds', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StoresScreen />));
    fireEvent.click(edit());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('button', { name: 'Edit Water can (10 L)' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('deleted');
    expect(s.doc().items['item-water']).toBeDefined();
    tick(5100);
    expect(s.doc().items['item-water']).toBeUndefined();
  });

  it('Undo after Delete brings the row back and keeps the stock', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StoresScreen />));
    fireEvent.click(edit());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(edit()).toBeTruthy();
    tick(10_000);
    expect(s.doc().items['item-water']!.qty).toBe(2);
  });
});

describe('the Stores floor sheet', () => {
  it('saves a changed floor, and a floor taken to 0 is removed', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StoresScreen />));
    fireEvent.click(screen.getByRole('button', { name: 'Set floors' }));
    const sheet = screen.getByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: /^One more: Floor for UHT milk/ }));
    const pasta = within(sheet).getByRole('button', { name: /^One fewer: Floor for Dried pasta/ });
    fireEvent.click(pasta);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save floors' }));
    const floors = s.doc().floors;
    expect(floors['loc-pantry|items-base:uht-milk']).toBe(4);
    expect(floors['loc-pantry|items-base:dried-pasta']).toBeUndefined();
    expect(floors['loc-pantry|items-base:rice-sack']).toBe(1);
  });

  it('writes nothing on Cancel', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StoresScreen />));
    fireEvent.click(screen.getByRole('button', { name: 'Set floors' }));
    fireEvent.click(screen.getByRole('button', { name: /^One more: Floor for UHT milk/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(s.labels).not.toContain('set floors');
  });
});

describe('the Stores search', () => {
  it('finds stock whose type is not in the packs whatever the case', () => {
    const doc = biggarDocument();
    doc.items['item-odd'] = {
      id: 'item-odd',
      typeId: 'gone-pack:Mystery-Tin',
      qty: 1,
      locationId: 'loc-shed',
      added: '2026-09-01',
      source: 'manual',
    };
    const s = liveStore(doc);
    render(s.wrap(<StoresScreen />));
    fireEvent.change(screen.getByLabelText('Search stock'), { target: { value: 'mystery' } });
    expect(screen.getByRole('button', { name: 'Edit Mystery-Tin' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search stock'), { target: { value: 'MYSTERY' } });
    expect(screen.getByRole('button', { name: 'Edit Mystery-Tin' })).toBeTruthy();
  });
});
