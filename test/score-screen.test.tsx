// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ScoreScreen } from '../src/app/screens/ScoreScreen';
import { scoreView, wholePercent } from '../src/app/screens/score/view';
import { StoreContext } from '../src/app/state/storeContext';
import { coverage, score } from '../src/engine';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { bundledPacks } from '../src/packs';
import type { DocumentStore } from '../src/store';

afterEach(cleanup);

const ok = { kind: 'ok' as const };
const show = (doc: ReturnType<typeof biggarDocument>) => {
  const store = {
    get: () => doc,
    status: () => ok,
    subscribe: () => () => undefined,
    change: () => undefined,
  } as unknown as DocumentStore;
  return render(
    <MemoryRouter>
      <StoreContext.Provider value={store}>
        <ScoreScreen />
      </StoreContext.Provider>
    </MemoryRouter>,
  );
};

describe('scoreView', () => {
  const doc = biggarDocument();
  const s = score(doc, bundledPacks(), '2026-11-15', 3);
  const v = scoreView(s, {
    coverage: coverage(doc, bundledPacks(), '2026-11-15', 3),
    region: 'UK',
  });

  it('shows what the engine returned, weakest bar first', () => {
    expect(v.overall).toBe(wholePercent(s.overall));
    expect(v.weakest).toBe('Heat');
    expect(v.bars[0]!.capability).toBe(s.weakest);
    const percents = v.bars.map((b) => b.percent);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
  });

  it('leads with the shortfall in numbers, then the rule’s words', () => {
    const bar = (cap: string) => v.bars.find((b) => b.capability === cap)!;
    expect(bar('heat').shortfall).toBe('Heat: 0 of 18 hours');
    expect(bar('plans').shortfall).toBe('Plans: 1 of 9 done');
    expect(bar('comms').shortfall).toBe('Communications: 0 of 1 radio');
    expect(bar('water').shortfall).toMatch(/^Water: [\d.]+ of [\d.]+ L$/);
    expect(v.bars.every((b) => b.shortfall !== '')).toBe(true);
  });

  it('gives each bar the weakest target’s own words as the reason', () => {
    const heat = v.bars.find((b) => b.capability === 'heat')!;
    expect(heat.reason).toBe(
      s.capabilities.find((c) => c.capability === 'heat')!.weakestTarget!.rules[0]!.text,
    );
    expect(v.bars.every((b) => b.reason !== '')).toBe(true);
  });

  it('describes the target by the rule that asks for most of it, not a pets add-on', () => {
    const water = s.capabilities.find((c) => c.capability === 'water')!.weakestTarget!;
    expect(water.rules.length).toBeGreaterThan(1);
    const top = [...water.rules].sort((a, b) => b.contribution - a.contribution)[0]!;
    expect(v.bars.find((b) => b.capability === 'water')!.reason).toBe(top.text);
    expect(top.text).not.toMatch(/\bpets?\b|\bdog|\bcat\b/i);
  });

  it('marks a capability at target as enough and previews the next horizon', () => {
    expect(v.bars.find((b) => b.capability === 'cooking')).toMatchObject({
      enough: true,
      percent: 100,
    });
    expect(v.next).toEqual({ days: 7, percent: wholePercent(s.nextHorizonPreview!) });
  });

  it('never rounds up to 100 until it is 100', () => {
    expect(wholePercent(99.6)).toBe(99);
    expect(wholePercent(100)).toBe(100);
    expect(wholePercent(250)).toBe(100);
    expect(wholePercent(-3)).toBe(0);
    expect(wholePercent(0.4)).toBe(0);
  });
});

describe('the Score screen', () => {
  it('renders the headline, the gap, the horizon link and a bar per need', () => {
    show(biggarDocument());
    const overall = screen.getByTestId('overall').textContent!;
    expect(overall).toMatch(/^\d+%$/);
    expect(screen.getByText('is your gap').textContent).toBeTruthy();
    expect(screen.getByRole('link', { name: 'at 3 days' }).getAttribute('href')).toBe(
      '/app/horizon',
    );
    expect(screen.getByRole('meter', { name: 'Heat' }).getAttribute('aria-valuenow')).toBe('0');
    const water = screen.getByRole('meter', { name: 'Water' });
    expect(Number(water.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    expect(screen.getByRole('meter', { name: 'Overall at 7 days' })).toBeTruthy();
    // the shortfall leads each bar's note; the rule's words follow in muted type
    const heat = screen.getByText('Heat: 0 of 18 hours');
    expect(heat.nextElementSibling?.className).toContain('muted');
  });

  it('follows the document: more water, a higher water bar', () => {
    const doc = structuredClone(biggarDocument());
    show(doc);
    const before = Number(
      screen.getByRole('meter', { name: 'Water' }).getAttribute('aria-valuenow'),
    );
    cleanup();
    doc.items['item-water']!.qty = 3;
    show(doc);
    const after = Number(
      screen.getByRole('meter', { name: 'Water' }).getAttribute('aria-valuenow'),
    );
    expect(after).toBeGreaterThan(before);
  });
});
