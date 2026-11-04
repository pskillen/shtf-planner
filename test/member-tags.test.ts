import { describe, expect, it } from 'vitest';
import type { Medication, Member } from '../src/model';
import {
  finishMember,
  hasNamedMedication,
  medicationComplete,
  medicationTagSetByHand,
  syncMedicationTag,
} from '../src/app/screens/memberTags';

const med = (name: string): Medication => ({
  id: name || 'blank',
  name,
  dosePerDay: 1,
  unitsOnHand: 0,
  critical: false,
});

describe('takes-medication follows the medication list', () => {
  it('adds the tag once a medicine has a name, not for a blank row', () => {
    expect(syncMedicationTag([], [med('')], false)).toEqual([]);
    expect(syncMedicationTag([], [med('Ramipril')], false)).toEqual(['takes-medication']);
  });

  it('removes the tag when the last medicine goes', () => {
    expect(syncMedicationTag(['elderly', 'takes-medication'], [], false)).toEqual(['elderly']);
  });

  it('does not add the tag twice', () => {
    expect(syncMedicationTag(['takes-medication'], [med('A'), med('B')], false)).toEqual([
      'takes-medication',
    ]);
  });

  it('leaves the tags alone when the chip was set by hand', () => {
    expect(syncMedicationTag(['takes-medication'], [], true)).toEqual(['takes-medication']);
    expect(syncMedicationTag([], [med('Ramipril')], true)).toEqual([]);
  });

  it('treats an existing tag that disagrees with the list as set by hand', () => {
    const base = { tags: [], medication: [] } satisfies Pick<Member, 'tags' | 'medication'>;
    expect(medicationTagSetByHand(base)).toBe(false);
    expect(medicationTagSetByHand({ tags: ['takes-medication'], medication: [] })).toBe(true);
    expect(medicationTagSetByHand({ tags: [], medication: [med('A')] })).toBe(true);
    expect(medicationTagSetByHand({ tags: ['takes-medication'], medication: [med('A')] })).toBe(
      false,
    );
  });

  it('needs a name on every medication row', () => {
    expect(medicationComplete([])).toBe(true);
    expect(medicationComplete([med('A'), med('  ')])).toBe(false);
    expect(hasNamedMedication([med('  ')])).toBe(false);
  });
});

describe('finishMember', () => {
  const person: Member = { id: 'm', name: ' Alex ', dob: '1984-03-12', tags: [], medication: [] };

  it('tags a dietary note and trims the name', () => {
    const done = finishMember({ ...person, dietary: ' vegetarian ' });
    expect(done.tags).toEqual(['dietary']);
    expect(done.dietary).toBe('vegetarian');
    expect(done.name).toBe('Alex');
  });

  it('adds nothing for an empty note, and never doubles the tag', () => {
    expect(finishMember({ ...person, dietary: '   ' })).toMatchObject({
      tags: [],
      dietary: undefined,
    });
    expect(finishMember({ ...person, tags: ['dietary'], dietary: 'nuts' }).tags).toEqual([
      'dietary',
    ]);
  });
});
