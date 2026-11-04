import { describe, expect, it } from 'vitest';
import {
  AssetSchema,
  DocumentSchema,
  ENVS,
  ItemInstanceSchema,
  LocationSchema,
  MedicationSchema,
  MemberSchema,
  PetSchema,
  PlanItemSchema,
  ReviewSchema,
  SCHEMA_VERSION,
  SettingsSchema,
  emptyDocument,
  floorKey,
} from './document';

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

    const item = {
      id: 'i',
      typeId: 'items-base:water-can',
      qty: 2,
      locationId: 'l',
      bestBefore: '2027-06',
      added: '2026-01-02',
      source: 'barcode' as const,
    };
    expect(roundTrip(ItemInstanceSchema, item)).toEqual(item);

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
      ItemInstanceSchema.parse({
        id: 'i',
        typeId: 't',
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

  it('keys floors by location and type', () => {
    expect(floorKey('loc', 'items-base:tinned-food')).toBe('loc|items-base:tinned-food');
  });
});
