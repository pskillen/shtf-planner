import { useMemo, useState } from 'react';
import { bundledPacks } from '../../packs';
import { formatVolume, today } from '../../util';
import { FieldGroup, Segmented } from '../components/controls';
import { EditArea } from '../components/EditArea';
import { ScreenHeader } from '../components/ScreenHeader';
import { HORIZONS, HORIZON_SENTENCE } from '../labels';
import { useChange, useDocument } from '../state';
import { biggestAsks, PREVIEW_IS_STUB, previewFor, type PreviewRow } from './horizon/previewSource';

function amountText(row: PreviewRow | undefined, region: 'UK' | 'US'): string {
  if (!row || row.amount === null) return '—';
  if (row.unit === 'L') return formatVolume(row.amount, region);
  return `${row.amount} ${row.unit}`.trim();
}

/** `picked` marks the chosen horizon; `shown` is the one column kept on a narrow screen. */
const colClass = (days: number, chosen: number, shown: number): string | undefined =>
  [days === chosen ? 'picked' : '', days === shown ? 'shown' : ''].filter(Boolean).join(' ') ||
  undefined;

/** How long to plan for: the amounts at 3, 7, 14 and 28 days for this household, and the pick. */
export function HorizonScreen({ embedded = false }: { embedded?: boolean }) {
  const doc = useDocument();
  const change = useChange();
  const chosen = doc.settings.horizonDays;
  const region = doc.settings.region;
  const preview = useMemo(() => previewFor(doc, bundledPacks(), today()), [doc]);
  // On a phone only one horizon's column fits: the picked one, unless the reader looks at another.
  const [looking, setLooking] = useState<number | null>(null);
  const shown = looking ?? chosen;
  const big = new Set(biggestAsks(preview));
  const labels = [...new Set(preview.flatMap((p) => p.rows.map((r) => r.label)))];

  return (
    <div>
      {embedded ? (
        <h1>How long should the plan cover?</h1>
      ) : (
        <ScreenHeader title="How long to plan for" />
      )}
      <p className="muted">
        Pick how many days you want to be able to manage with no mains, shops or water. You can
        change it any time from the Home tab.
      </p>
      <EditArea>
        <FieldGroup label="Plan for">
          <Segmented
            label="Days to plan for"
            value={chosen}
            options={HORIZONS.map((h) => ({ value: h, label: `${h} days` }))}
            onChange={(horizonDays) => {
              setLooking(null);
              change('horizon', (d) => void (d.settings.horizonDays = horizonDays));
            }}
          />
        </FieldGroup>
      </EditArea>
      <p>{HORIZON_SENTENCE[chosen]}</p>

      <h2>What that means for your household</h2>
      {PREVIEW_IS_STUB ? (
        <p className="note">
          The amounts are worked out by the planning engine, which is not in this version yet. The
          table shows what it will cover.
        </p>
      ) : null}
      <div className="narrow-only">
        <FieldGroup label="Show amounts for">
          <Segmented
            label="Days to show amounts for"
            value={shown}
            options={HORIZONS.map((h) => ({ value: h, label: `${h} days` }))}
            onChange={setLooking}
          />
        </FieldGroup>
      </div>
      <div className="table-wrap">
        <table className="horizon">
          <thead>
            <tr>
              <th scope="col">Need</th>
              {preview.map((p) => (
                <th
                  scope="col"
                  key={p.horizonDays}
                  className={colClass(p.horizonDays, chosen, shown)}
                >
                  {p.horizonDays} days
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((label) => (
              <tr key={label} className={big.has(label) ? 'big' : undefined}>
                <th scope="row">{label}</th>
                {preview.map((p) => {
                  const row = p.rows.find((r) => r.label === label);
                  return (
                    <td key={p.horizonDays} className={colClass(p.horizonDays, chosen, shown)}>
                      {amountText(row, region)}
                      {row?.example ? <div className="muted">{row.example}</div> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
