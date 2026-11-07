import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CATEGORIES, type Asset, type AssetType, type Category } from '../../model';
import { coverage, maintenanceDue, addMonths, type BlockedAsset } from '../../engine';
import { blockedBadge } from '../blocked';
import { formatVolume, today } from '../../util';
import { Field } from '../components/controls';
import { EditArea } from '../components/EditArea';
import { useSavedChange } from '../components/SavedNote';
import { ScreenHeader } from '../components/ScreenHeader';
import { isDirty } from '../components/isDirty';
import { Sheet } from '../components/Sheet';
import { useDeferredDelete } from '../components/useDeferredDelete';
import { CATEGORY_LABEL, labelOf } from '../labels';
import { useChange, useDocument } from '../state';
import { usePacks } from '../usePacks';
import { QuestionField } from './assets/QuestionField';
import { defaultAnswers, describeContributions, setAnswer } from './assets/questionnaire';

const newId = () => crypto.randomUUID();

function TypePicker({ types, onPick }: { types: AssetType[]; onPick: (t: AssetType) => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const q = query.trim().toLowerCase();
  // Only the categories that have a type to pick, in the usual order.
  const categories = CATEGORIES.filter((c) => types.some((t) => t.category === c));
  const shown = types.filter(
    (t) =>
      (category === null || t.category === category) && (!q || t.name.toLowerCase().includes(q)),
  );
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
      <div className="chips" role="group" aria-label="Show category">
        {[null, ...categories].map((c) => (
          <button
            key={c ?? 'all'}
            type="button"
            className={c === category ? 'chip on' : 'chip'}
            aria-pressed={c === category}
            onClick={() => setCategory(c)}
          >
            {c === null ? 'All' : labelOf(CATEGORY_LABEL, c)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="muted">{q ? `Nothing matches “${query}”.` : 'Nothing in this category.'}</p>
      ) : null}
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
  onMaintenance,
  note,
}: {
  type: AssetType;
  initial: Asset;
  isNew: boolean;
  onSave: (a: Asset) => void;
  onDelete?: () => void;
  onClose: () => void;
  onMaintenance: (job: string, date: string) => void;
  note: React.ReactNode;
}) {
  const doc = useDocument();
  const packs = usePacks();
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

      {type.contributes
        .filter((c) => c.converts && !c.converts.fuel.selectionQuestion)
        .map((c, i) => (
          <p key={i}>
            Fuel: {c.converts!.fuel.itemIds.map((id) => packs.items[id]?.name ?? id).join(', ')}
          </p>
        ))}
      {type.guidance?.map((g) => (
        <p key={g.text}>
          {g.text} <a href={g.source}>Read guidance</a>
        </p>
      ))}
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
      {type.maintenance.length ? (
        <section>
          <h3>Maintenance</h3>
          {note}
          {type.maintenance.map((job) => {
            const last = a.maintenance[job.id];
            const start = last ?? a.purchased;
            const due = start ? addMonths(start, job.everyMonths) : today();
            const format = (date: string, options: Intl.DateTimeFormatOptions) =>
              new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
                ...options,
                timeZone: 'UTC',
              });
            const setDate = (date: string) => {
              setA((current) => ({
                ...current,
                maintenance: { ...current.maintenance, [job.id]: date },
              }));
              onMaintenance(job.id, date);
            };
            return (
              <div key={job.id}>
                <strong>{job.text}</strong>
                <p>
                  {last
                    ? `Last done ${format(last, { day: 'numeric', month: 'short', year: 'numeric' })} · next due ${format(due, { month: 'short', year: 'numeric' })}`
                    : 'Not recorded'}
                </p>
                <button type="button" onClick={() => setDate(today())}>
                  Done today
                </button>
                <Field label={`Last done: ${job.text}`}>
                  <input
                    type="date"
                    max={today()}
                    value={last ?? ''}
                    onChange={(e) => {
                      if (e.target.value && e.target.value <= today()) setDate(e.target.value);
                    }}
                  />
                </Field>
              </div>
            );
          })}
        </section>
      ) : null}
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
  const saved = useSavedChange();
  const packs = usePacks();
  const [params, setParams] = useSearchParams();
  // Deep links from elsewhere: ?add=<asset type id> opens the add form for that type (Quick add,
  // the shopping list), ?edit=<asset id> the edit form (Stores). Unknown ids are ignored. The
  // screen mounts when the link is followed, so the link is read once, as the initial state.
  const [editing, setEditing] = useState<Editing>(() => {
    const addId = params.get('add');
    const editId = params.get('edit');
    const type = addId ? packs.assets[addId] : undefined;
    if (type)
      return {
        step: 'form',
        type,
        isNew: true,
        asset: { id: newId(), typeId: type.id, answers: defaultAnswers(type), maintenance: {} },
      };
    const existing = editId ? doc.assets[editId] : undefined;
    const existingType = existing ? packs.assets[existing.typeId] : undefined;
    return existing && existingType
      ? { step: 'form', type: existingType, asset: existing, isNew: false }
      : null;
  });
  // Take the link off the address so a reload or a Back does not open the form again.
  const hasLink = params.has('add') || params.has('edit');
  useEffect(() => {
    if (hasLink) setParams({}, { replace: true });
  }, [hasLink, setParams]);

  // Assets that give the plan nothing, and why, from the engine (never worked out here).
  const blocked = useMemo(() => {
    const out = new Map<string, BlockedAsset[]>();
    for (const c of coverage(doc, packs, today())) {
      for (const b of c.blockedAssets ?? []) {
        const list = out.get(b.assetId) ?? [];
        if (!list.some((x) => x.reason === b.reason)) out.set(b.assetId, [...list, b]);
      }
    }
    return out;
  }, [doc, packs]);

  const available = useMemo(() => {
    const enabled = new Set(packs.enabledPacks(doc.settings).map((p) => p.id));
    return Object.values(packs.assets).filter((t) => enabled.has(t.id.split(':')[0]!));
  }, [packs, doc.settings]);

  const remove = useDeferredDelete((id) =>
    change('delete asset', (d) => {
      delete d.assets[id];
    }),
  );

  const dueAssets = new Set(
    maintenanceDue(doc, packs, today())
      .filter((job) => job.due <= today())
      .map((job) => job.assetId),
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
              const why = blocked.get(a.id);
              return (
                <li className={why ? 'row-item row-item-wrap' : 'row-item'} key={a.id}>
                  <button
                    type="button"
                    className="row-main"
                    aria-label={`Edit ${a.name || type?.name || a.typeId}`}
                    aria-describedby={dueAssets.has(a.id) ? `maintenance-${a.id}` : undefined}
                    disabled={!type}
                    onClick={() =>
                      type && setEditing({ step: 'form', type, asset: a, isNew: false })
                    }
                  >
                    <strong>
                      {a.name || type?.name || a.typeId}{' '}
                      {why ? <span className="badge badge-warn">Blocked</span> : null}
                      {dueAssets.has(a.id) ? (
                        <span id={`maintenance-${a.id}`} className="badge badge-warn">
                          Maintenance due
                        </span>
                      ) : null}
                    </strong>
                    <span className="muted">
                      {a.name && type ? `${type.name} · ` : ''}
                      {type ? (where ?? 'No place set') : 'Its content pack is not loaded'}
                    </span>
                    {why ? (
                      <span className="warn">{[...new Set(why.map(blockedBadge))].join(', ')}</span>
                    ) : null}
                  </button>
                  {why ? (
                    <details className="why">
                      <summary>Why?</summary>
                      <p className="muted">{why.map((b) => b.reason).join(' ')}</p>
                    </details>
                  ) : null}
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
          note={saved.note}
          onMaintenance={(job, date) => {
            if (!editing.isNew)
              saved.change('record maintenance', (d) => {
                const asset = d.assets[editing.asset.id];
                if (asset) asset.maintenance[job] = date;
              });
          }}
          onSave={(a) => {
            change(editing.isNew ? 'add asset' : 'edit asset', (d) => {
              if (editing.isNew) d.assets[a.id] = a;
              else {
                const current = d.assets[a.id];
                if (!current) return;
                for (const key of ['name', 'notes', 'locationId', 'purchased'] as const) {
                  if (a[key] !== editing.asset[key]) current[key] = a[key];
                }
                for (const key of new Set([
                  ...Object.keys(a.answers),
                  ...Object.keys(editing.asset.answers),
                ])) {
                  if (a.answers[key] !== editing.asset.answers[key]) {
                    if (key in a.answers) current.answers[key] = a.answers[key]!;
                    else delete current.answers[key];
                  }
                }
              }
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
