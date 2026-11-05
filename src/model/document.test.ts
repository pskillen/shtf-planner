import { describe, expect, it } from 'vitest';
import {
  AssetSchema,
  DocumentSchema,
  ENVS,
  LocationSchema,
  MedicationSchema,
  MemberSchema,
  PetSchema,
  PlanItemSchema,
  ProductSchema,
  ReviewSchema,
  SCHEMA_VERSION,
  ScanSchema,
  SettingsSchema,
  StockSchema,
  emptyDocument,
  minimumKey,
} from './document';
import { SizeSchema } from './primitives';

const roundTrip = <T>(schema: { parse: (v: unknown) => T }, value: T): T =>
  schema.parse(JSON.parse(JSON.stringify(value)));

describe('the document model', () => {
  it('emptyDocument is valid and round-trips through JSON', () => {
    const doc = emptyDocument('local', '2026-01-01T00:00:00.000Z');
    expect(doc.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(roundTrip(DocumentSchema, doc)).toEqual(doc);
  });

  it('knows all six environments', () => {
    expect([...ENVS]).toEqual(['local', 'preview', 'dev', 'next', 'staging', 'prod']);
    for (const env of ENVS) expect(emptyDocument(env).meta.env).toBe(env);
  });

  it('round-trips every entity', () => {
    const medication = {
      id: 'm1',
      name: 'Ramipril',
      dosePerDay: 1,
      unitsOnHand: 21,
      cycleDays: 28,
      critical: true,
    };
    expect(roundTrip(MedicationSchema, medication)).toEqual(medication);

    const member = {
      id: 'a',
      name: 'Alex',
      dob: '1984-03-12',
      tags: ['elderly' as const],
      dietary: 'vegetarian',
      medication: [medication],
    };
    expect(roundTrip(MemberSchema, member)).toEqual(member);

    const pet = { id: 'p', name: 'Bramble', species: 'dog' as const, size: 'M' as const };
    expect(roundTrip(PetSchema, pet)).toEqual(pet);

    const location = {
      id: 'l',
      name: 'Garage',
      kind: 'stored' as const,
      conditions: ['frost' as const, 'damp' as const],
      size: 'L' as const,
      litres: 400,
    };
    expect(roundTrip(LocationSchema, location)).toEqual(location);

    const asset = {
      id: 'x',
      typeId: 'assets-base:solar-pv',
      name: 'Roof PV',
      locationId: 'l',
      purchased: '2022-05-01',
      notes: 'south roof',
      answers: { kwp: 4, hasEps: false, make: 'x' },
      maintenance: { clean: '2026-03-01' },
    };
    expect(roundTrip(AssetSchema, asset)).toEqual(asset);

    const product = {
      id: 'p1',
      name: 'Heinz Beanz 415 g',
      itemId: 'items-base:baked-beans',
      size: { amount: 415, unit: 'g' as const },
      labelKcalPer100: 75,
      added: '2026-01-02',
    };
    expect(roundTrip(ProductSchema, product)).toEqual(product);
    const nothing = {
      id: 'p2',
      name: 'Garden twine',
      size: { amount: 1, unit: 'pieces' as const },
      added: '2026-01-02',
    };
    expect(roundTrip(ProductSchema, nothing)).toEqual(nothing);

    const stock = {
      id: 's',
      productId: 'p1',
      qty: 2.5,
      locationId: 'l',
      bestBefore: '2027-06',
      added: '2026-01-02',
      source: 'barcode' as const,
    };
    expect(roundTrip(StockSchema, stock)).toEqual(stock);

    const scan = {
      id: 'q',
      code: '5449000000996',
      qty: 1,
      locationId: 'l',
      scanned: '2026-01-02T10:00:00.000Z',
      off: {
        found: true,
        name: 'Zx Cola',
        quantity: '24 x 330 ml',
        size: { count: 24, amount: 330, unit: 'ml' as const },
        kcalPer100: 42,
        categories: ['en:sodas'],
        checked: '2026-01-02T10:00:01.000Z',
      },
    };
    expect(roundTrip(ScanSchema, scan)).toEqual(scan);

    expect(roundTrip(PlanItemSchema, { doneAt: '2026-01-01', note: 'done' })).toEqual({
      doneAt: '2026-01-01',
      note: 'done',
    });

    const review = {
      id: 'r',
      started: '2026-01-01T10:00:00.000Z',
      finished: '2026-01-01T10:20:00.000Z',
      resolved: ['gap-1'],
      scoreBefore: 40,
      scoreAfter: 55,
    };
    expect(roundTrip(ReviewSchema, review)).toEqual(review);

    const settings = emptyDocument('local').settings;
    expect(roundTrip(SettingsSchema, settings)).toEqual(settings);
  });

  it('rejects malformed values', () => {
    expect(() =>
      MemberSchema.parse({ id: 'a', name: 'A', dob: '12/03/1984', tags: [], medication: [] }),
    ).toThrow();
    expect(() =>
      StockSchema.parse({
        id: 'i',
        productId: 'p',
        qty: 1,
        locationId: 'l',
        bestBefore: '2027-06-01',
        added: '2026-01-02',
        source: 'manual',
      }),
    ).toThrow();
    expect(() =>
      DocumentSchema.parse({ ...emptyDocument('local'), settings: { horizonDays: 5 } }),
    ).toThrow();
  });

  it('stock quantities are whole packs or quarters', () => {
    const base = {
      id: 's',
      productId: 'p',
      locationId: 'l',
      added: '2026-01-02',
      source: 'manual',
    };
    for (const qty of [0.25, 0.5, 0.75, 1, 1.5, 12]) {
      expect(StockSchema.safeParse({ ...base, qty }).success, String(qty)).toBe(true);
    }
    for (const qty of [1 / 3, 0.1, 0, -1, 2.2]) {
      expect(StockSchema.safeParse({ ...base, qty }).success, String(qty)).toBe(false);
    }
  });

  it('sizes are an amount and a unit, with an optional multipack count of two or more', () => {
    expect(SizeSchema.safeParse({ amount: 500, unit: 'ml' }).success).toBe(true);
    expect(SizeSchema.safeParse({ count: 24, amount: 500, unit: 'ml' }).success).toBe(true);
    expect(SizeSchema.safeParse({ count: 1, amount: 500, unit: 'ml' }).success).toBe(false);
    expect(SizeSchema.safeParse({ amount: 0, unit: 'g' }).success).toBe(false);
    expect(SizeSchema.safeParse({ amount: 5, unit: 'oz' }).success).toBe(false);
    expect(SizeSchema.safeParse({ amount: 5, unit: 'g', extra: 1 }).success).toBe(false);
  });

  it('keys minimums by location and item', () => {
    expect(minimumKey('loc', 'items-base:baked-beans')).toBe('loc|items-base:baked-beans');
  });

  it('has no items, customTypes or floors any more', () => {
    const doc = emptyDocument('local');
    for (const gone of ['items', 'customTypes', 'floors']) expect(doc).not.toHaveProperty(gone);
    for (const kept of ['products', 'barcodes', 'stock', 'scans', 'minimums']) {
      expect(doc).toHaveProperty(kept);
    }
  });
});
