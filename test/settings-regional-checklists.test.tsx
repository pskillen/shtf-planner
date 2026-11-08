// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentPacks } from '../src/app/screens/settings/ContentPacks';
import { emptyDocument, type Pack, type Packs } from '../src/model';
import { bundledPacks } from '../src/packs';

afterEach(cleanup);

const ck = (id: string, region?: 'UK' | 'US') =>
  ({
    format: 1,
    id,
    version: 3,
    name: `Checklist ${id}`,
    kind: 'checklists',
    ...(region ? { region } : {}),
    scenarios: [],
    steps: [],
  }) as unknown as Pack;

const withChecklists = (...c: Pack[]): Packs =>
  ({ ...bundledPacks(), all: [...bundledPacks().all, ...c] }) as Packs;

describe('Settings, regional checklist packs', () => {
  it('shows this region as included text with no switch, and not the other region', () => {
    const doc = emptyDocument('local');
    const onToggle = vi.fn();
    render(
      <ContentPacks
        packs={withChecklists(ck('uk', 'UK'), ck('us', 'US'))}
        settings={doc.settings}
        onToggle={onToggle}
      />,
    );
    expect(screen.getByText('Scenario checklists')).toBeTruthy();
    expect(screen.getByText('Checklist uk, version 3')).toBeTruthy();
    expect(screen.getByText('Included for your region')).toBeTruthy();
    expect(screen.queryByText(/Checklist us/)).toBeNull();
    expect(screen.queryByRole('switch', { name: /Checklist/ })).toBeNull();
    expect(screen.getAllByRole('switch')).toHaveLength(bundledPacks().all.length);
    fireEvent.click(screen.getAllByRole('switch')[0]);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(doc.settings.packs).toEqual(emptyDocument('local').settings.packs);
  });

  it('says none are available when only the other region has one', () => {
    const doc = emptyDocument('local');
    render(
      <ContentPacks
        packs={withChecklists(ck('us', 'US'))}
        settings={doc.settings}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText(/No scenario checklists are available/)).toBeTruthy();
    expect(screen.queryByText(/Checklist us/)).toBeNull();
  });

  it('draws no group when no checklist pack is bundled', () => {
    const doc = emptyDocument('local');
    render(<ContentPacks packs={bundledPacks()} settings={doc.settings} onToggle={vi.fn()} />);
    expect(screen.queryByText('Scenario checklists')).toBeNull();
  });
});
