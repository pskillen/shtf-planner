import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Medication, Member, Pet, RiskTag } from '../../model';
import { RISK_TAGS } from '../../model';
import { daysOfSupply, formatAge, suggestedAgeTags, today } from '../../util';
import {
  ChipGroup,
  Field,
  FieldGroup,
  NumberInput,
  Segmented,
  Switch,
} from '../components/controls';
import { EditArea } from '../components/EditArea';
import { ScreenHeader } from '../components/ScreenHeader';
import { isDirty } from '../components/isDirty';
import { Sheet } from '../components/Sheet';
import { useDeferredDelete } from '../components/useDeferredDelete';
import { RISK_TAG_LABEL, SIZE_LABEL, SPECIES_LABEL, labelOf } from '../labels';
import { useChange, useDocument } from '../state';
import {
  finishMember,
  medicationComplete,
  medicationTagSetByHand,
  syncMedicationTag,
} from './memberTags';

const AGE_TAGS: readonly RiskTag[] = ['infant', 'child', 'elderly'];
const TAG_OPTIONS = RISK_TAGS.map((t) => ({ value: t, label: RISK_TAG_LABEL[t] }));

const newId = () => crypto.randomUUID();

function blankMember(): Member {
  return { id: newId(), name: '', dob: '', tags: [], medication: [] };
}

function blankMedication(): Medication {
  return { id: newId(), name: '', dosePerDay: 1, unitsOnHand: 0, critical: false };
}

/**
 * The member form. Keeps a draft and writes on Save. Age tags (infant, child, elderly) follow the
 * date of birth until the tags are edited by hand; an existing person's tags are never rewritten
 * by a change of date unless they are still the ones the old date suggested.
 */
function MemberSheet({
  initial,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  initial: Member;
  isNew: boolean;
  onSave: (m: Member) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [m, setM] = useState<Member>(initial);
  const [touched, setTouched] = useState(!isNew);
  const [medTagByHand, setMedTagByHand] = useState(() => medicationTagSetByHand(initial));
  const now = today();

  const setDob = (dob: string) =>
    setM((cur) => {
      if (touched) return { ...cur, dob };
      const suggested = suggestedAgeTags(dob, now);
      return {
        ...cur,
        dob,
        tags: [...cur.tags.filter((t) => !AGE_TAGS.includes(t)), ...suggested],
      };
    });

  /** Changes the medication list; the `takes-medication` tag follows it unless set by hand. */
  const setMeds = (update: (list: Medication[]) => Medication[]) =>
    setM((cur) => {
      const medication = update(cur.medication);
      return { ...cur, medication, tags: syncMedicationTag(cur.tags, medication, medTagByHand) };
    });
  const setMed = (id: string, patch: Partial<Medication>) =>
    setMeds((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const suggested = suggestedAgeTags(m.dob, now).filter((t) => !m.tags.includes(t));
  const medsOk = medicationComplete(m.medication);
  const valid = m.name.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(m.dob) && medsOk;

  const save = () => onSave(finishMember(m));

  return (
    <Sheet
      title={isNew ? 'Add a person' : `Edit ${initial.name || 'person'}`}
      onClose={onClose}
      dirty={isDirty(m, initial)}
      actions={
        <>
          {onDelete ? (
            <button type="button" className="danger" onClick={onDelete}>
              Delete
            </button>
          ) : null}
          <button type="button" onClick={save} disabled={!valid}>
            Save
          </button>
        </>
      }
    >
      <Field label="Name">
        <input
          type="text"
          autoComplete="off"
          value={m.name}
          onChange={(e) => setM({ ...m, name: e.target.value })}
        />
      </Field>
      <Field
        label="Date of birth"
        hint={
          m.dob ? `Age: ${formatAge(m.dob, now)}` : 'Used for how much food and water they need.'
        }
      >
        <input type="date" value={m.dob} max={now} onChange={(e) => setDob(e.target.value)} />
      </Field>
      <FieldGroup
        label="Anything we should plan around?"
        hint={
          suggested.length > 0 ? (
            <>
              From their age we suggest:{' '}
              {suggested.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="chip suggest"
                  onClick={() => {
                    setTouched(true);
                    setM({ ...m, tags: [...m.tags, t] });
                  }}
                >
                  + {labelOf(RISK_TAG_LABEL, t)}
                </button>
              ))}
            </>
          ) : undefined
        }
      >
        <ChipGroup
          label="Risk tags"
          options={TAG_OPTIONS}
          value={m.tags}
          onChange={(tags) => {
            setTouched(true);
            if (tags.includes('takes-medication') !== m.tags.includes('takes-medication')) {
              setMedTagByHand(true);
            }
            setM({ ...m, tags });
          }}
        />
      </FieldGroup>
      <Field label="Dietary note" hint="Allergies, vegetarian, gluten free…">
        <input
          type="text"
          value={m.dietary ?? ''}
          onChange={(e) => setM({ ...m, dietary: e.target.value })}
        />
      </Field>

      <h3>Medication</h3>
      {m.medication.length === 0 ? (
        <p className="muted">
          None. Add what they take every day so the plan counts the days left.
        </p>
      ) : null}
      {m.medication.map((med) => {
        const days = daysOfSupply(med.unitsOnHand, med.dosePerDay);
        return (
          <div className="med-row" key={med.id}>
            <Field label="Medicine">
              <input
                type="text"
                value={med.name}
                onChange={(e) => setMed(med.id, { name: e.target.value })}
              />
            </Field>
            <Field label="Units taken per day">
              <NumberInput
                value={med.dosePerDay}
                onChange={(n) => setMed(med.id, { dosePerDay: n ?? 0 })}
                ariaLabel={`Units taken per day for ${med.name || 'medicine'}`}
              />
            </Field>
            <Field label="Units on hand">
              <NumberInput
                value={med.unitsOnHand}
                onChange={(n) => setMed(med.id, { unitsOnHand: n ?? 0 })}
                ariaLabel={`Units on hand for ${med.name || 'medicine'}`}
              />
            </Field>
            <Field label="Repeat cycle in days" hint="Optional: how often you collect it.">
              <NumberInput
                value={med.cycleDays}
                min={1}
                step={1}
                onChange={(n) => setMed(med.id, { cycleDays: n ? Math.round(n) : undefined })}
                ariaLabel={`Repeat cycle in days for ${med.name || 'medicine'}`}
              />
            </Field>
            <Switch
              label="Critical: they cannot go without it"
              checked={med.critical}
              onChange={(critical) => setMed(med.id, { critical })}
            />
            <p>
              <strong>
                {days === undefined ? 'Days of supply: set a dose' : `${days} days of supply`}
              </strong>
            </p>
            <button
              type="button"
              className="secondary"
              onClick={() => setMeds((list) => list.filter((x) => x.id !== med.id))}
            >
              Remove {med.name || 'medicine'}
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="secondary"
        onClick={() => setMeds((list) => [...list, blankMedication()])}
      >
        Add medication
      </button>
      {!medsOk ? <p className="muted">Give each medicine a name to save.</p> : null}
    </Sheet>
  );
}

function PetSheet({
  initial,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  initial: Pet;
  isNew: boolean;
  onSave: (p: Pet) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [p, setP] = useState<Pet>(initial);
  return (
    <Sheet
      title={isNew ? 'Add a pet' : `Edit ${initial.name || 'pet'}`}
      onClose={onClose}
      dirty={isDirty(p, initial)}
      actions={
        <>
          {onDelete ? (
            <button type="button" className="danger" onClick={onDelete}>
              Delete
            </button>
          ) : null}
          <button
            type="button"
            disabled={p.name.trim() === ''}
            onClick={() => onSave({ ...p, name: p.name.trim() })}
          >
            Save
          </button>
        </>
      }
    >
      <Field label="Name">
        <input
          type="text"
          autoComplete="off"
          value={p.name}
          onChange={(e) => setP({ ...p, name: e.target.value })}
        />
      </Field>
      <FieldGroup label="What kind of animal?">
        <Segmented
          label="Species"
          value={p.species}
          options={(['dog', 'cat', 'other'] as const).map((s) => ({
            value: s,
            label: SPECIES_LABEL[s],
          }))}
          onChange={(species) => setP({ ...p, species })}
        />
      </FieldGroup>
      <FieldGroup label="How big?">
        <Segmented
          label="Size"
          value={p.size}
          options={(['S', 'M', 'L'] as const).map((s) => ({ value: s, label: SIZE_LABEL[s] }))}
          onChange={(size) => setP({ ...p, size })}
        />
      </FieldGroup>
    </Sheet>
  );
}

type Editing =
  | { kind: 'member'; member: Member; isNew: boolean }
  | { kind: 'pet'; pet: Pet; isNew: boolean }
  | null;

/** People and pets: a list, and a sheet to add or edit one. Used in onboarding and as a screen. */
export function PeopleScreen({ embedded = false }: { embedded?: boolean }) {
  const doc = useDocument();
  const change = useChange();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Editing>(() => {
    const member = doc.household.members.find((m) => m.id === params.get('member'));
    return member ? { kind: 'member', member, isNew: false } : null;
  });
  const now = today();
  const closeEditing = () => {
    setEditing(null);
    if (params.has('member')) setParams({}, { replace: true });
  };

  const removeMember = useDeferredDelete((id) =>
    change('delete person', (d) => {
      d.household.members = d.household.members.filter((m) => m.id !== id);
    }),
  );
  const removePet = useDeferredDelete((id) =>
    change('delete pet', (d) => {
      d.household.pets = d.household.pets.filter((p) => p.id !== id);
    }),
  );

  const members = doc.household.members.filter((m) => !removeMember.pending.has(m.id));
  const pets = doc.household.pets.filter((p) => !removePet.pending.has(p.id));

  const saveMember = (m: Member) => {
    change(editing?.kind === 'member' && editing.isNew ? 'add person' : 'edit person', (d) => {
      const i = d.household.members.findIndex((x) => x.id === m.id);
      if (i >= 0) d.household.members[i] = m;
      else d.household.members.push(m);
    });
    closeEditing();
  };
  const savePet = (p: Pet) => {
    change(editing?.kind === 'pet' && editing.isNew ? 'add pet' : 'edit pet', (d) => {
      const i = d.household.pets.findIndex((x) => x.id === p.id);
      if (i >= 0) d.household.pets[i] = p;
      else d.household.pets.push(p);
    });
    setEditing(null);
  };

  return (
    <div>
      {embedded ? <h1>Who is in your household?</h1> : <ScreenHeader title="People" />}
      {members.length === 0 ? <p className="muted">Nobody yet. Add yourself first.</p> : null}
      <ul className="row-list">
        {members.map((m) => (
          <li className="row-item" key={m.id}>
            <button
              type="button"
              className="row-main"
              aria-label={`Edit ${m.name}`}
              onClick={() => setEditing({ kind: 'member', member: m, isNew: false })}
            >
              <strong>{m.name}</strong>
              <span className="muted">
                {formatAge(m.dob, now)}
                {m.tags.length > 0
                  ? ` · ${m.tags.map((t) => labelOf(RISK_TAG_LABEL, t)).join(', ')}`
                  : ''}
              </span>
            </button>
          </li>
        ))}
        {pets.map((p) => (
          <li className="row-item" key={p.id}>
            <button
              type="button"
              className="row-main"
              aria-label={`Edit ${p.name}`}
              onClick={() => setEditing({ kind: 'pet', pet: p, isNew: false })}
            >
              <strong>{p.name}</strong>
              <span className="muted">
                {labelOf(SPECIES_LABEL, p.species)}, {labelOf(SIZE_LABEL, p.size).toLowerCase()}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <EditArea>
        <div className="add-bar">
          <button
            type="button"
            onClick={() => setEditing({ kind: 'member', member: blankMember(), isNew: true })}
          >
            Add a person
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setEditing({
                kind: 'pet',
                pet: { id: newId(), name: '', species: 'dog', size: 'M' },
                isNew: true,
              })
            }
          >
            Add a pet
          </button>
        </div>
      </EditArea>

      {editing?.kind === 'member' ? (
        <MemberSheet
          initial={editing.member}
          isNew={editing.isNew}
          onSave={saveMember}
          onDelete={
            editing.isNew
              ? undefined
              : () => {
                  removeMember.request(editing.member.id, editing.member.name || 'Person');
                  closeEditing();
                }
          }
          onClose={closeEditing}
        />
      ) : null}
      {editing?.kind === 'pet' ? (
        <PetSheet
          initial={editing.pet}
          isNew={editing.isNew}
          onSave={savePet}
          onDelete={
            editing.isNew
              ? undefined
              : () => {
                  removePet.request(editing.pet.id, editing.pet.name || 'Pet');
                  setEditing(null);
                }
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
      {removeMember.toast ?? removePet.toast}
    </div>
  );
}
