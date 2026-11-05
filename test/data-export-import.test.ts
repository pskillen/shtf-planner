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
    expect(file.text).toContain('schemaVersion: 4');
    expect(file.text).toContain('Alex');
  });
});

describe('products and stock in export and import', () => {
  it('round-trips through the JSON and the YAML export', () => {
    const doc = biggarDocument();
    const text = JSON.stringify(doc, null, 2);
    for (const source of [text, yamlExport(text).text]) {
      const p = previewImport(source);
      if (!p.ok) throw new Error(p.error);
      expect(JSON.parse(p.json).products).toEqual(doc.products);
      expect(JSON.parse(p.json).stock).toEqual(doc.stock);
    }
  });

  it('counts them in the preview like the other record sets', () => {
    const p = previewImport(json());
    if (!p.ok) throw new Error(p.error);
    expect(p.summary.products).toBeGreaterThan(0);
    expect(p.summary.stock).toBeGreaterThan(0);
  });

  it('refuses a schema-3 export', () => {
    const v3: Record<string, unknown> = JSON.parse(json());
    (v3.meta as Record<string, unknown>).schemaVersion = 3;
    expect(previewImport(JSON.stringify(v3))).toMatchObject({
      ok: false,
      error: 'This file is from an older version of the app and cannot be imported.',
    });
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
    expect(fromJson.summary.products).toBeGreaterThan(0);
    expect(fromJson.summary.stock).toBeGreaterThan(0);
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

describe('barcodes and scans in export and import', () => {
  const withScanning = () => {
    const doc = biggarDocument();
    doc.scans['s1'] = {
      id: 's1',
      code: '5000169005743',
      qty: 2,
      locationId: Object.keys(doc.locations)[0]!,
      bestBefore: '2027-06',
      scanned: '2026-11-04T10:00:00.000Z',
      off: {
        found: true,
        name: 'Test beans',
        quantity: '415 g',
        checked: '2026-11-04T10:01:00.000Z',
      },
    };
    return doc;
  };

  it('round-trips a remembered barcode and a scan through JSON and YAML', () => {
    const doc = withScanning();
    expect(Object.keys(doc.barcodes)).toContain('3017620422003');
    const text = JSON.stringify(doc, null, 2);
    for (const source of [text, yamlExport(text).text]) {
      const p = previewImport(source);
      if (!p.ok) throw new Error(p.error);
      const back = JSON.parse(p.json);
      expect(back.barcodes).toEqual(doc.barcodes);
      expect(back.scans).toEqual(doc.scans);
    }
  });

  it('counts them in the preview', () => {
    const p = previewImport(JSON.stringify(withScanning()));
    if (!p.ok) throw new Error(p.error);
    expect(p.summary.barcodes).toBe(1);
    expect(p.summary.scans).toBe(1);
  });
});
