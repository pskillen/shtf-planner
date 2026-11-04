import { useState } from 'react';
import { CONDITIONS, type Condition, type Location } from '../../model';
import { formatVolume } from '../../util';
import { ChipGroup, Field, FieldGroup, NumberInput, Segmented } from '../components/controls';
import { ScreenHeader } from '../components/ScreenHeader';
import { Sheet } from '../components/Sheet';
import { useDeferredDelete } from '../components/useDeferredDelete';
import { CONDITION_LABEL, SIZE_LABEL } from '../labels';
import { useChange, useDocument } from '../state';
import { deleteLocation } from './locations';

const newId = () => crypto.randomUUID();

/** Places worth suggesting first. Tapping one opens the form filled in; nothing is created until Save. */
const LOCATION_SUGGESTIONS: ReadonlyArray<Omit<Location, 'id'>> = [
  { name: 'Pantry', kind: 'rotating', conditions: ['indoor-stable'], size: 'M' },
  { name: 'Garage', kind: 'stored', conditions: ['frost', 'damp'], size: 'L' },
  { name: 'Loft', kind: 'stored', conditions: ['frost', 'heat'], size: 'M' },
  { name: 'Shed', kind: 'stored', conditions: ['frost', 'damp', 'heat'], size: 'M' },
  { name: 'Grab bags', kind: 'stored', conditions: ['indoor-stable'], size: 'S' },
];

function LocationSheet({
  initial,
  isNew,
  blockedDelete,
  onSave,
  onDelete,
  onClose,
}: {
  initial: Location;
  isNew: boolean;
  /** Set when stock is held here, which would be orphaned: says why delete is off. */
  blockedDelete?: string;
  onSave: (l: Location) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const region = useDocument().home.region;
  const [l, setL] = useState<Location>(initial);
  return (
    <Sheet
      title={isNew ? 'Add a place' : `Edit ${initial.name}`}
      onClose={onClose}
      actions={
        <>
          {onDelete ? (
            <button type="button" className="danger" onClick={onDelete} disabled={!!blockedDelete}>
              Delete
            </button>
          ) : null}
          <button
            type="button"
            disabled={l.name.trim() === ''}
            onClick={() => onSave({ ...l, name: l.name.trim() })}
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
          value={l.name}
          onChange={(e) => setL({ ...l, name: e.target.value })}
        />
      </Field>
      <FieldGroup
        label="How do you use it?"
        hint={
          l.kind === 'rotating'
            ? 'Rotating counts the level you never go below, not today’s stock.'
            : 'Stored is stock you put away and leave until you need it.'
        }
      >
        <Segmented
          label="Kind"
          value={l.kind}
          options={[
            { value: 'rotating', label: 'Rotating' },
            { value: 'stored', label: 'Stored' },
          ]}
          onChange={(kind) => setL({ ...l, kind })}
        />
      </FieldGroup>
      <FieldGroup label="What is it like there?">
        <ChipGroup
          label="Conditions"
          options={CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABEL[c] }))}
          value={l.conditions}
          onChange={(conditions: Condition[]) => setL({ ...l, conditions })}
        />
      </FieldGroup>
      <FieldGroup label="How big?">
        <Segmented
          label="Size"
          value={l.size}
          options={(['S', 'M', 'L'] as const).map((s) => ({ value: s, label: SIZE_LABEL[s] }))}
          onChange={(size) => setL({ ...l, size })}
        />
      </FieldGroup>
      <Field
        label="Volume in litres"
        hint={
          l.litres !== undefined
            ? `About ${formatVolume(l.litres, region)}. Optional.`
            : 'Optional: roughly how much it holds.'
        }
      >
        <NumberInput
          value={l.litres}
          ariaLabel="Volume in litres"
          onChange={(litres) => setL({ ...l, litres })}
        />
      </Field>
      {blockedDelete ? <p className="note">{blockedDelete}</p> : null}
    </Sheet>
  );
}

/** Where things are kept. */
export function LocationsScreen() {
  const doc = useDocument();
  const change = useChange();
  const [editing, setEditing] = useState<{ location: Location; isNew: boolean } | null>(null);

  const remove = useDeferredDelete((id) => change('delete location', (d) => deleteLocation(d, id)));

  const all = Object.values(doc.locations).filter((l) => !remove.pending.has(l.id));
  const names = new Set(all.map((l) => l.name.toLowerCase()));
  const suggestions = LOCATION_SUGGESTIONS.filter((s) => !names.has(s.name.toLowerCase()));
  const stockHere = (id: string) =>
    Object.values(doc.items).filter((i) => i.locationId === id).length;

  return (
    <div>
      <ScreenHeader title="Locations" />
      <p className="muted">The places you keep things. Stock is counted by place.</p>
      {all.length === 0 ? <p className="muted">No places yet.</p> : null}
      <ul className="row-list">
        {all.map((l) => (
          <li className="row-item" key={l.id}>
            <button
              type="button"
              className="row-main"
              aria-label={`Edit ${l.name}`}
              onClick={() => setEditing({ location: l, isNew: false })}
            >
              <strong>
                {l.name}{' '}
                <span className="badge">{l.kind === 'rotating' ? 'Rotating' : 'Stored'}</span>
              </strong>
              <span className="muted">
                {l.conditions.length > 0
                  ? l.conditions.map((c) => CONDITION_LABEL[c]).join(', ')
                  : 'No conditions'}
                {' · '}
                {SIZE_LABEL[l.size].toLowerCase()}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="add-bar">
        <button
          type="button"
          onClick={() =>
            setEditing({
              location: { id: newId(), name: '', kind: 'stored', conditions: [], size: 'M' },
              isNew: true,
            })
          }
        >
          Add a place
        </button>
      </div>
      {suggestions.length > 0 ? (
        <>
          <h2>Suggestions</h2>
          <div className="chips">
            {suggestions.map((s) => (
              <button
                key={s.name}
                type="button"
                className="chip suggest"
                onClick={() => setEditing({ location: { ...s, id: newId() }, isNew: true })}
              >
                + {s.name}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {editing ? (
        <LocationSheet
          key={editing.location.id}
          initial={editing.location}
          isNew={editing.isNew}
          blockedDelete={
            !editing.isNew && stockHere(editing.location.id) > 0
              ? `${stockHere(editing.location.id)} stock entries are kept here. Move or remove them before deleting this place.`
              : undefined
          }
          onSave={(l) => {
            change(editing.isNew ? 'add location' : 'edit location', (d) => {
              d.locations[l.id] = l;
            });
            setEditing(null);
          }}
          onDelete={
            editing.isNew
              ? undefined
              : () => {
                  remove.request(editing.location.id, editing.location.name);
                  setEditing(null);
                }
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
      {remove.toast}
    </div>
  );
}
