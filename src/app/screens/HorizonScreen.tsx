import { useMemo } from 'react';
import { bundledPacks } from '../../packs';
import { formatVolume, today } from '../../util';
import { FieldGroup, Segmented } from '../components/controls';
import { ScreenHeader } from '../components/ScreenHeader';
import { HORIZONS, HORIZON_SENTENCE } from '../labels';
import { useChange, useDocument } from '../state';
import { biggestAsks, PREVIEW_IS_STUB, previewFor, type PreviewRow } from './horizon/previewSource';

function amountText(row: PreviewRow | undefined, region: 'UK' | 'US'): string {
  if (!row || row.amount === null) return '—';
  if (row.unit === 'L') return formatVolume(row.amount, region);
  return `${row.amount} ${row.unit}`.trim();
}

/** How long to plan for: the amounts at 3, 7, 14 and 28 days for this household, and the pick. */
export function HorizonScreen({ embedded = false }: { embedded?: boolean }) {
  const doc = useDocument();
  const change = useChange();
  const chosen = doc.settings.horizonDays;
  const region = doc.settings.region;
  const preview = useMemo(() => previewFor(doc, bundledPacks(), today()), [doc]);
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
      <FieldGroup label="Plan for">
        <Segmented
          label="Days to plan for"
          value={chosen}
          options={HORIZONS.map((h) => ({ value: h, label: `${h} days` }))}
          onChange={(horizonDays) =>
            change('horizon', (d) => void (d.settings.horizonDays = horizonDays))
          }
        />
      </FieldGroup>
      <p>{HORIZON_SENTENCE[chosen]}</p>

      <h2>What that means for your household</h2>
      {PREVIEW_IS_STUB ? (
        <p className="note">
          The amounts are worked out by the planning engine, which is not in this version yet. The
          table shows what it will cover.
        </p>
      ) : null}
      <div className="table-wrap">
        <table className="horizon">
          <thead>
            <tr>
              <th scope="col">Need</th>
              {preview.map((p) => (
                <th
                  scope="col"
                  key={p.horizonDays}
                  className={p.horizonDays === chosen ? 'picked' : undefined}
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
                    <td
                      key={p.horizonDays}
                      className={p.horizonDays === chosen ? 'picked' : undefined}
                    >
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
