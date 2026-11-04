import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DocumentSchema, migrate } from '../src/model';
import { bundledPacks } from '../src/packs';
import { biggarDocument } from './fixtures/household-biggar';

const jsonPath = fileURLToPath(new URL('./fixtures/household-biggar.json', import.meta.url));

/** The committed export: sorted keys, two-space indent, trailing newline (what `export()` writes). */
function exportText(doc: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(sort(doc), null, 2) + '\n';
}

// Regenerate with `WRITE_FIXTURE=1 npx vitest run test/fixtures.test.ts`.
if (process.env.WRITE_FIXTURE === '1') writeFileSync(jsonPath, exportText(biggarDocument()));

describe('the Biggar fixture household', () => {
  const doc = biggarDocument();

  it('is a valid, current document', () => {
    expect(DocumentSchema.parse(doc)).toEqual(doc);
    expect(migrate(doc)).toEqual(doc);
  });

  it('matches the committed JSON export', () => {
    expect(readFileSync(jsonPath, 'utf8')).toBe(exportText(doc));
  });

  it('is the invented family in ML12', () => {
    expect(doc.home).toMatchObject({ area: 'ML12', region: 'UK', insulation: 'excellent' });
    expect(doc.household.members.map((m) => m.name)).toEqual(['Alex', 'Sam', 'Robin', 'Jo', 'Pat']);
    expect(doc.household.pets[0]).toMatchObject({ name: 'Bramble', species: 'dog', size: 'M' });
    expect(Object.keys(doc.locations)).toHaveLength(5);
    expect(doc.assets['asset-solar']!.answers).toEqual({ kwp: 4, hasEps: false });
  });

  it('only names pack things that exist, and its pack versions are current', () => {
    const packs = bundledPacks();
    for (const i of Object.values(doc.items)) {
      expect(packs.items[i.typeId], i.typeId).toBeDefined();
      expect(doc.locations[i.locationId], i.locationId).toBeDefined();
    }
    for (const a of Object.values(doc.assets)) {
      const type = packs.assets[a.typeId];
      expect(type, a.typeId).toBeDefined();
      for (const key of Object.keys(a.answers)) {
        expect(
          type!.questions.map((q) => q.id),
          `${a.id}.${key}`,
        ).toContain(key);
      }
      for (const key of Object.keys(a.maintenance)) {
        expect(
          type!.maintenance.map((m) => m.id),
          `${a.id}.${key}`,
        ).toContain(key);
      }
    }
    for (const key of Object.keys(doc.plans)) expect(packs.plans[key], key).toBeDefined();
    for (const key of Object.keys(doc.floors)) {
      const [locationId, typeId] = key.split('|');
      expect(doc.locations[locationId!]?.kind).toBe('rotating');
      expect(packs.items[typeId!], typeId).toBeDefined();
    }
    for (const [id, version] of Object.entries(doc.meta.packVersions)) {
      expect(packs.byId[id]?.version, id).toBe(version);
    }
  });
});
