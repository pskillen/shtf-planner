// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { reviewItems, reviewPeriod } from '../src/engine';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { bundledPacks } from '../src/packs';
import { answerReview, completePlan, undoReview } from '../src/app/screens/review/actions';
import { ReviewScreen } from '../src/app/screens/ReviewScreen';
import { liveStore } from './helpers/liveStore';

const day = '2026-11-04';
const packs = bundledPacks();
function setup() {
  const doc = biggarDocument();
  doc.household.members.push({
    id: 'baby',
    name: 'Baby',
    dob: '2026-08-01',
    tags: [],
    medication: [],
  });
  doc.plans['plans-base:first-aid-course'] = {
    doneAt: '2023-02-01',
    expires: '2024-02-01',
    note: 'keep',
  };
  return doc;
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('restores a removed batch exactly and rejects a newly added matching tuple', () => {
  const doc = setup();
  const item = reviewItems(doc, packs, day, reviewPeriod(doc, day).until).find(
    (i) => i.kind === 'expiry',
  )!;
  if (item.kind !== 'expiry') throw new Error('expected expiry');
  const original = structuredClone(doc.stock[item.stockId]!);
  const receipt = answerReview(doc, packs, item, 'used', day, `${day}T12:00:00Z`, 'review', 'op')!;
  expect(doc.stock[item.stockId]).toBeUndefined();
  doc.stock.new = { ...original, id: 'new' };
  expect(undoReview(doc, receipt)).toBe(false);
  delete doc.stock.new;
  expect(undoReview(doc, receipt)).toBe(true);
  expect(doc.stock[item.stockId]).toEqual(original);
  expect(doc.reviews.review!.resolved).toEqual([]);
});
it('restores only touched maintenance and plan dates, and rejects stale changes', () => {
  const doc = setup();
  const items = reviewItems(doc, packs, day, reviewPeriod(doc, day).until);
  const maintenance = items.find((i) => i.kind === 'maintenance')!;
  if (maintenance.kind !== 'maintenance') throw new Error('expected maintenance');
  const asset = doc.assets[maintenance.assetId]!;
  const before = asset.maintenance[maintenance.jobId];
  const receipt = answerReview(
    doc,
    packs,
    maintenance,
    'done',
    day,
    `${day}T12:00:00Z`,
    'review',
    'op',
  )!;
  asset.name = 'changed';
  asset.maintenance[maintenance.jobId] = '2026-11-05';
  expect(undoReview(doc, receipt)).toBe(false);
  asset.maintenance[maintenance.jobId] = day;
  expect(undoReview(doc, receipt)).toBe(true);
  expect(asset.maintenance[maintenance.jobId]).toBe(before);
  expect(asset.name).toBe('changed');
  const plan = items.find((i) => i.kind === 'plan')!;
  if (plan.kind !== 'plan') throw new Error('expected plan');
  const old = structuredClone(doc.plans[plan.planId]);
  const p = answerReview(doc, packs, plan, 'no-longer', day, `${day}T12:00:00Z`, 'review', 'op2')!;
  expect(doc.plans[plan.planId]!.note).toBe('keep');
  expect(undoReview(doc, p)).toBe(true);
  expect(doc.plans[plan.planId]).toEqual(old);
});
it('refreshes plan expiry from its interval', () => {
  const p = { doneAt: '2023-01-01', expires: '2023-01-11', note: 'keep' };
  completePlan(p, day);
  expect(p.expires).toBe('2026-11-14');
  completePlan(p, day, 6);
  expect(p.expires).toBe('2027-05-04');
});
it('answers every kind and undo restores the latest answer', () => {
  vi.setSystemTime(new Date(`${day}T12:00:00Z`));
  const store = liveStore(setup());
  render(store.wrap(<ReviewScreen />));
  for (const [kind, label] of [
    ['expiry', 'Fine'],
    ['maintenance', 'Done'],
    ['age', 'Noted'],
    ['recount', 'Recounted'],
    ['plan', 'Still true'],
  ]) {
    const row = document.querySelector<HTMLElement>(`[data-review-kind="${kind}"]`)!;
    fireEvent.click(within(row).getByRole('button', { name: new RegExp(`^${label}:`) }));
  }
  expect(Object.values(store.store.get().reviews)[0]!.resolved).toHaveLength(5);
  fireEvent.click(screen.getByRole('button', { name: /^Undo Still true:/ }));
  expect(Object.values(store.store.get().reviews)[0]!.resolved).toHaveLength(4);
});
it('keeps replacement choice when the sheet is cancelled', () => {
  vi.setSystemTime(new Date(`${day}T12:00:00Z`));
  const store = liveStore(setup());
  render(store.wrap(<ReviewScreen />));
  const row = document.querySelector<HTMLElement>('[data-review-kind="expiry"]')!;
  fireEvent.click(within(row).getByRole('button', { name: /^Replace:/ }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /close/i }));
  expect(Object.values(store.store.get().reviews)[0]!.resolved[0]).toContain('replace');
  expect(screen.getByRole('button', { name: /^Undo / })).toBeTruthy();
});
it('disables answers in a read-only document', () => {
  vi.setSystemTime(new Date(`${day}T12:00:00Z`));
  const store = liveStore(setup());
  vi.spyOn(store.store, 'status').mockReturnValue({ kind: 'invalid', error: new Error('invalid') });
  render(store.wrap(<ReviewScreen />));
  const row = document.querySelector<HTMLElement>('[data-review-kind="expiry"]')!;
  expect(
    within(row)
      .getByRole('button', { name: /^Used:/ })
      .hasAttribute('disabled'),
  ).toBe(true);
  fireEvent.click(within(row).getByRole('button', { name: /^Used:/ }));
  expect(Object.keys(store.store.get().reviews)).toHaveLength(0);
});

it('keeps independent undo windows for rapid answers', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${day}T12:00:00Z`));
  const store = liveStore(setup());
  render(store.wrap(<ReviewScreen />));
  const first = document.querySelector<HTMLElement>('[data-review-kind="expiry"]')!;
  fireEvent.click(within(first).getByRole('button', { name: /^Fine:/ }));
  vi.advanceTimersByTime(1000);
  const second = document.querySelector<HTMLElement>('[data-review-kind="maintenance"]')!;
  fireEvent.click(within(second).getByRole('button', { name: /^Done:/ }));
  expect(screen.getByRole('button', { name: /^Undo Fine: .+ · Best before / })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Undo Done: .+ · .+/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /^Undo Fine:/ }));
  expect(Object.values(store.store.get().reviews)[0]!.resolved).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: /^Undo / }));
  expect(Object.values(store.store.get().reviews)[0]!.resolved).toHaveLength(0);
});
it('keeps earlier undo accessible and pauses each window during replacement', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${day}T12:00:00Z`));
  const store = liveStore(setup());
  render(store.wrap(<ReviewScreen />));
  const maintenance = document.querySelector<HTMLElement>('[data-review-kind="maintenance"]')!;
  fireEvent.click(within(maintenance).getByRole('button', { name: /^Done:/ }));
  act(() => vi.advanceTimersByTime(2000));
  const expiry = document.querySelector<HTMLElement>('[data-review-kind="expiry"]')!;
  fireEvent.click(within(expiry).getByRole('button', { name: /^Replace:/ }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getAllByRole('button', { name: /^Undo / })).toHaveLength(2);
  act(() => vi.advanceTimersByTime(6000));
  expect(within(dialog).getByRole('button', { name: /^Undo Done: .+ · .+/ })).toBeTruthy();
  expect(
    within(dialog).getByRole('button', { name: /^Undo Replace: .+ · Best before / }),
  ).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: /^Undo Done:/ }));
  expect(Object.values(store.store.get().reviews)[0]!.resolved).toHaveLength(1);
  fireEvent.click(within(dialog).getByRole('button', { name: /close/i }));
  act(() => vi.advanceTimersByTime(4999));
  expect(screen.getByRole('button', { name: /^Undo / })).toBeTruthy();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole('button', { name: /^Undo / })).toBeNull();
});
it('rejects stale stock, maintenance and plan answers without changing the document', () => {
  for (const kind of ['expiry', 'maintenance', 'plan'] as const) {
    const doc = setup();
    const item = reviewItems(doc, packs, day, reviewPeriod(doc, day).until).find(
      (i) => i.kind === kind,
    )!;
    if (item.kind === 'expiry') doc.stock[item.stockId]!.qty += 1;
    if (item.kind === 'maintenance') doc.assets[item.assetId]!.maintenance[item.jobId] = day;
    if (item.kind === 'plan') doc.plans[item.planId]!.doneAt = day;
    const before = structuredClone(doc);
    expect(
      answerReview(
        doc,
        packs,
        item,
        kind === 'expiry' ? 'replace' : kind === 'maintenance' ? 'done' : 'no-longer',
        day,
        `${day}T12:00:00Z`,
        'review',
        'op',
      ),
    ).toBeUndefined();
    expect(doc).toEqual(before);
  }
});
it('rejects removed stock parents before replacement', () => {
  const doc = setup();
  const item = reviewItems(doc, packs, day, reviewPeriod(doc, day).until).find(
    (i) => i.kind === 'expiry',
  )!;
  if (item.kind !== 'expiry') throw new Error('expected expiry');
  delete doc.products[item.productId];
  expect(
    answerReview(doc, packs, item, 'replace', day, `${day}T12:00:00Z`, 'review', 'op'),
  ).toBeUndefined();
  expect(doc.stock[item.stockId]).toBeDefined();
});

it('opens replacement for an unclassified product and preserves the answer after cancel and remount', () => {
  vi.setSystemTime(new Date(`${day}T12:00:00Z`));
  const doc = setup();
  const item = reviewItems(doc, packs, day, reviewPeriod(doc, day).until).find(
    (i) => i.kind === 'expiry',
  )!;
  if (item.kind !== 'expiry') throw new Error('expected expiry');
  delete doc.products[item.productId]!.itemId;
  const store = liveStore(doc);
  const view = render(store.wrap(<ReviewScreen />));
  const row = document.querySelector<HTMLElement>('[data-review-kind="expiry"]')!;
  fireEvent.click(within(row).getByRole('button', { name: /^Replace:/ }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /close/i }));
  view.unmount();
  render(store.wrap(<ReviewScreen />));
  expect(store.store.get().stock[item.stockId]).toBeUndefined();
  expect(Object.values(store.store.get().reviews)[0]!.resolved[0]).toContain('replace');
});
