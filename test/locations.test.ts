import { describe, expect, it } from 'vitest';
import { deleteLocation } from '../src/app/screens/locations';
import { floorKey } from '../src/model';
import { BIGGAR_IDS, biggarDocument } from '../src/fixtures/household-biggar';

const { pantry, shed } = BIGGAR_IDS.locations;

describe('deleteLocation', () => {
  it('removes the place', () => {
    const doc = biggarDocument();
    deleteLocation(doc, shed);
    expect(doc.locations[shed]).toBeUndefined();
    expect(Object.keys(doc.locations)).toHaveLength(4);
  });

  it('clears the location of the assets that were kept there, and keeps the assets', () => {
    const doc = biggarDocument();
    const before = Object.values(doc.assets);
    const kept = before.filter((a) => a.locationId === shed);
    expect(kept.length).toBeGreaterThan(0);
    deleteLocation(doc, shed);
    expect(Object.values(doc.assets)).toHaveLength(before.length);
    for (const a of kept) expect(doc.assets[a.id]!.locationId).toBeUndefined();
    const elsewhere = before.filter((a) => a.locationId && a.locationId !== shed);
    for (const a of elsewhere) expect(doc.assets[a.id]!.locationId).toBe(a.locationId);
  });

  it('drops the place’s floor entries and no one else’s', () => {
    const doc = biggarDocument();
    doc.floors[floorKey(shed, 'items-base:tinned-food')] = 4;
    const pantryKeys = Object.keys(doc.floors).filter((k) => k.startsWith(`${pantry}|`));
    expect(pantryKeys.length).toBeGreaterThan(0);
    deleteLocation(doc, shed);
    expect(Object.keys(doc.floors).some((k) => k.startsWith(`${shed}|`))).toBe(false);
    expect(Object.keys(doc.floors).filter((k) => k.startsWith(`${pantry}|`))).toEqual(pantryKeys);
  });

  it('does nothing for a place that is not there', () => {
    const doc = biggarDocument();
    const before = structuredClone(doc);
    deleteLocation(doc, 'loc-missing');
    expect(doc).toEqual(before);
  });
});
