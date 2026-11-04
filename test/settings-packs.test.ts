import { describe, expect, it } from 'vitest';
import { packLabel, packSwitch, setPack } from '../src/app/screens/settings/packs';
import { emptyDocument } from '../src/model';
import { bundledPacks } from '../src/packs';

const US = { id: 'guidance-us-ready', region: 'US' as const };
const UK = { id: 'guidance-uk-prepare', region: 'UK' as const };
const BASE = { id: 'items-base' };

describe('the content pack switches', () => {
  it('shows a pack for the other region as off and wrong-region, even if its id is listed', () => {
    const doc = emptyDocument('local');
    expect(doc.settings.packs).toContain(US.id);
    expect(packSwitch(US, doc.settings)).toEqual({ on: false, wrongRegion: true });
    expect(packSwitch(UK, doc.settings)).toEqual({ on: true, wrongRegion: false });
    expect(packSwitch(BASE, doc.settings)).toEqual({ on: true, wrongRegion: false });
  });

  it('follows the region', () => {
    const doc = emptyDocument('local');
    doc.settings.region = 'US';
    expect(packSwitch(US, doc.settings).on).toBe(true);
    expect(packSwitch(UK, doc.settings).wrongRegion).toBe(true);
  });

  it('turns a pack off and on without doubling it', () => {
    const doc = emptyDocument('local');
    setPack(doc, BASE, false);
    expect(doc.settings.packs).not.toContain(BASE.id);
    setPack(doc, BASE, true);
    setPack(doc, BASE, true);
    expect(doc.settings.packs.filter((id) => id === BASE.id)).toHaveLength(1);
  });

  it('leaves a pack for the other region alone', () => {
    const doc = emptyDocument('local');
    const before = [...doc.settings.packs];
    setPack(doc, US, false);
    setPack(doc, US, true);
    expect(doc.settings.packs).toEqual(before);
  });

  it('labels a pack without doubling brackets', () => {
    expect(
      packLabel({ name: 'Grid-free capability rules (planner assumptions)', version: 1 }),
    ).toBe('Grid-free capability rules (planner assumptions), version 1');
  });

  it('knows the regions of the bundled packs', () => {
    const regions = Object.fromEntries(bundledPacks().all.map((p) => [p.id, p.region]));
    expect(regions[US.id]).toBe('US');
    expect(regions[UK.id]).toBe('UK');
  });
});
