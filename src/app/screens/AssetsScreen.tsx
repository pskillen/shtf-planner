import { useMemo, useState } from 'react';
import type { Asset, AssetType } from '../../model';
import { bundledPacks } from '../../packs';
import { formatVolume } from '../../util';
import { Field } from '../components/controls';
import { EditArea } from '../components/EditArea';
import { ScreenHeader } from '../components/ScreenHeader';
import { isDirty } from '../components/isDirty';
import { Sheet } from '../components/Sheet';
import { useDeferredDelete } from '../components/useDeferredDelete';
import { CATEGORY_LABEL, labelOf } from '../labels';
import { useChange, useDocument } from '../state';
import { QuestionField } from './assets/QuestionField';
import { defaultAnswers, describeContributions, setAnswer } from './assets/questionnaire';

const newId = () => crypto.randomUUID();

function TypePicker({ types, onPick }: { types: AssetType[]; onPick: (t: AssetType) => void }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? types.filter((t) => t.name.toLowerCase().includes(q)) : types;
  return (
    <>
      <Field label="Search equipment">
        <input
          type="search"
          value={query}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
      </Field>
      {shown.length === 0 ? <p className="muted">Nothing matches “{query}”.</p> : null}
      <ul className="row-list">
        {shown.map((t) => (
          <li className="row-item" key={t.id}>
            <button type="button" className="row-main" onClick={() => onPick(t)}>
              <strong>{t.name}</strong>
              <span className="muted">{labelOf(CATEGORY_LABEL, t.category)}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function AssetForm({
  type,
  initial,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  type: AssetType;
  initial: Asset;
  isNew: boolean;
  onSave: (a: Asset) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const doc = useDocument();
  const [a, setA] = useState<Asset>(initial);
  const locations = Object.values(doc.locations);
  const lines = describeContributions(type, a.answers);

  return (
    <Sheet
      title={isNew ? `Add ${type.name}` : `Edit ${a.name || type.name}`}
      onClose={onClose}
      dirty={isDirty(a, initial)}
      actions={
        <>
          {onDelete ? (
            <button type="button" className="danger" onClick={onDelete}>
              Delete
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              const trim = (s: string | undefined) => s?.trim() || undefined;
              onSave({ ...a, name: trim(a.name), notes: trim(a.notes) });
            }}
          >
            Save
          </button>
        </>
      }
    >
      <Field label="Your name for it" hint="Optional, like “garage generator”.">
        <input
          type="text"
          value={a.name ?? ''}
          autoComplete="off"
          onChange={(e) => setA({ ...a, name: e.target.value })}
        />
      </Field>

      {type.questions.map((q) => (
        <QuestionField
          key={q.id}
          question={q}
          value={a.answers[q.id]}
          hint={
            q.kind === 'number' && q.unit === 'L' && typeof a.answers[q.id] === 'number'
              ? `About ${formatVolume(a.answers[q.id] as number, doc.home.region)}`
              : undefined
          }
          onAnswer={(raw) => setA({ ...a, answers: setAnswer(a.answers, q, raw) })}
        />
      ))}

      <div className="note" aria-live="polite">
        {lines.length === 0 ? (
          <p>Does not add to the plan on its own.</p>
        ) : (
          lines.map((l) => <p key={l.capability}>{l.text}</p>)
        )}
      </div>

      <Field label="Where is it kept?">
        <select
          value={a.locationId ?? ''}
          onChange={(e) =>
            setA({ ...a, locationId: e.target.value === '' ? undefined : e.target.value })
          }
        >
          <option value="">Not set</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Date bought">
        <input
          type="date"
          value={a.purchased ?? ''}
          onChange={(e) => setA({ ...a, purchased: e.target.value || undefined })}
        />
      </Field>
      <Field label="Notes">
        <textarea value={a.notes ?? ''} onChange={(e) => setA({ ...a, notes: e.target.value })} />
      </Field>
    </Sheet>
  );
}

type Editing =
  { step: 'pick' } | { step: 'form'; type: AssetType; asset: Asset; isNew: boolean } | null;

/** Equipment: things that give capability (generators, stoves, panels), grouped by category. */
export function AssetsScreen() {
  const doc = useDocument();
  const change = useChange();
  const [editing, setEditing] = useState<Editing>(null);
  const packs = bundledPacks();

  const available = useMemo(() => {
    const enabled = new Set(packs.enabledPacks(doc.settings).map((p) => p.id));
    return Object.values(packs.assets).filter((t) => enabled.has(t.id.split(':')[0]!));
  }, [packs, doc.settings]);

  const remove = useDeferredDelete((id) =>
    change('delete asset', (d) => {
      delete d.assets[id];
    }),
  );

  const assets = Object.values(doc.assets).filter((a) => !remove.pending.has(a.id));
  const groups = new Map<string, Asset[]>();
  for (const a of assets) {
    const cat = packs.assets[a.typeId]?.category;
    const key = cat ? labelOf(CATEGORY_LABEL, cat) : 'Other';
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const sortedGroups = [...groups.entries()].sort(([x], [y]) => x.localeCompare(y));

  return (
    <div>
      <ScreenHeader title="Equipment" />
      <p className="muted">
        Generators, stoves, panels, batteries: anything that keeps the house going without the
        mains.
      </p>
      {assets.length === 0 ? <p className="muted">Nothing added yet.</p> : null}
      {sortedGroups.map(([label, list]) => (
        <section key={label}>
          <h2>{label}</h2>
          <ul className="row-list">
            {list.map((a) => {
              const type = packs.assets[a.typeId];
              const where = a.locationId ? doc.locations[a.locationId]?.name : undefined;
              return (
                <li className="row-item" key={a.id}>
                  <button
                    type="button"
                    className="row-main"
                    aria-label={`Edit ${a.name || type?.name || a.typeId}`}
                    disabled={!type}
                    onClick={() =>
                      type && setEditing({ step: 'form', type, asset: a, isNew: false })
                    }
                  >
                    <strong>{a.name || type?.name || a.typeId}</strong>
                    <span className="muted">
                      {a.name && type ? `${type.name} · ` : ''}
                      {type ? (where ?? 'No place set') : 'Its content pack is not loaded'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <EditArea>
        <div className="add-bar">
          <button type="button" onClick={() => setEditing({ step: 'pick' })}>
            Add equipment
          </button>
        </div>
      </EditArea>

      {editing?.step === 'pick' ? (
        <Sheet title="What are you adding?" onClose={() => setEditing(null)}>
          <TypePicker
            types={available}
            onPick={(type) =>
              setEditing({
                step: 'form',
                type,
                isNew: true,
                asset: {
                  id: newId(),
                  typeId: type.id,
                  answers: defaultAnswers(type),
                  maintenance: {},
                },
              })
            }
          />
        </Sheet>
      ) : null}
      {editing?.step === 'form' ? (
        <AssetForm
          key={editing.asset.id}
          type={editing.type}
          initial={editing.asset}
          isNew={editing.isNew}
          onSave={(a) => {
            change(editing.isNew ? 'add asset' : 'edit asset', (d) => {
              d.assets[a.id] = a;
            });
            setEditing(null);
          }}
          onDelete={
            editing.isNew
              ? undefined
              : () => {
                  remove.request(editing.asset.id, editing.asset.name || editing.type.name);
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
