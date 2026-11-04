import { describe, expect, it } from 'vitest';
import { biggarDocument } from '../src/fixtures/household-biggar';
import {
  jsonExport,
  localDate,
  previewImport,
  yamlExport,
} from '../src/app/screens/data/exportImport';

const json = () => JSON.stringify(biggarDocument(), null, 2);

describe('export', () => {
  it('names files household-YYYY-MM-DD in the local date', () => {
    const d = new Date(2026, 10, 4, 23, 59);
    expect(localDate(d)).toBe('2026-11-04');
    expect(jsonExport('{}', d).filename).toBe('household-2026-11-04.json');
    expect(yamlExport('{}', d).filename).toBe('household-2026-11-04.yaml');
  });

  it('puts the build environment in the name unless it is prod', () => {
    const d = new Date(2026, 10, 4, 12);
    expect(jsonExport('{}', d, 'next').filename).toBe('household-next-2026-11-04.json');
    expect(yamlExport('{}', d, 'local').filename).toBe('household-local-2026-11-04.yaml');
    expect(jsonExport('{}', d, 'prod').filename).toBe('household-2026-11-04.json');
  });

  it('writes the same document as YAML', () => {
    const file = yamlExport(json());
    expect(file.mime).toBe('application/yaml');
    expect(file.text).toContain('schemaVersion: 2');
    expect(file.text).toContain('Alex');
  });
});

describe('custom types in export and import', () => {
  const withType = () => {
    const doc = biggarDocument();
    doc.customTypes['custom:soup'] = {
      id: 'custom:soup',
      name: 'Soup',
      category: 'food',
      unit: 'tin',
      gives: [{ store: 'foodKcal', amount: 300 }],
      suitability: ['frost'],
      shelfLife: 'none',
      tags: [],
    };
    return doc;
  };

  it('round-trips through the JSON and the YAML export', () => {
    const doc = withType();
    const text = JSON.stringify(doc, null, 2);
    for (const source of [text, yamlExport(text).text]) {
      const p = previewImport(source);
      if (!p.ok) throw new Error(p.error);
      expect(JSON.parse(p.json).customTypes).toEqual(doc.customTypes);
    }
  });

  it('a schema-1 export imports with no custom types', () => {
    const v1: Record<string, unknown> = JSON.parse(json());
    delete v1.customTypes;
    (v1.meta as Record<string, unknown>).schemaVersion = 1;
    const p = previewImport(JSON.stringify(v1));
    if (!p.ok) throw new Error(p.error);
    expect(JSON.parse(p.json).customTypes).toEqual({});
  });

  it('refuses a schema-3 export', () => {
    const v3: Record<string, unknown> = JSON.parse(json());
    (v3.meta as Record<string, unknown>).schemaVersion = 3;
    expect(previewImport(JSON.stringify(v3))).toMatchObject({ ok: false });
  });
});

describe('import preview', () => {
  it('reports the environment the file was written by', () => {
    const doc = { ...biggarDocument(), meta: { ...biggarDocument().meta, env: 'dev' as const } };
    expect(previewImport(JSON.stringify(doc))).toMatchObject({ ok: true, fileEnv: 'dev' });
  });

  it('round-trips JSON and YAML to the same document, with counts', () => {
    const fromJson = previewImport(json());
    const fromYaml = previewImport(yamlExport(json()).text);
    if (!fromJson.ok || !fromYaml.ok) throw new Error('expected both to parse');
    expect(fromYaml.json).toBe(fromJson.json);
    expect(fromJson.summary.members).toBe(5);
    expect(fromJson.summary.items).toBeGreaterThan(0);
    expect(JSON.parse(fromJson.json)).toEqual(JSON.parse(JSON.stringify(biggarDocument())));
  });

  it('refuses what is not a household, in plain words', () => {
    expect(previewImport('{ nope')).toMatchObject({ ok: false });
    expect(previewImport('just: words')).toMatchObject({ ok: false });
    expect(previewImport('[1, 2]')).toMatchObject({
      ok: false,
      error: 'That file does not look like a household export.',
    });
    expect(previewImport('42')).toMatchObject({ ok: false });
  });

  it('refuses an export from a newer version', () => {
    const doc = JSON.parse(json());
    doc.meta.schemaVersion = 99;
    const out = previewImport(JSON.stringify(doc));
    expect(out).toMatchObject({ ok: false });
    expect(out.ok === false && out.error).toMatch(/newer version/);
  });
});
