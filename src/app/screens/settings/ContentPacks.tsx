import type { Document, Pack, Packs } from '../../../model';
import { Switch } from '../../components/controls';
import { packLabel, packSwitch, splitPacks } from './packs';

/**
 * The pack switches, then the checklist packs shown as regional content: they come with the
 * region and are not switched, so none is ever written to the household's pack list.
 */
export function ContentPacks({
  packs,
  settings,
  onToggle,
}: {
  packs: Packs;
  settings: Pick<Document['settings'], 'region' | 'packs'>;
  onToggle: (pack: Pack, on: boolean) => void;
}) {
  const { switchable, regional, hasChecklists } = splitPacks(packs, settings.region);
  return (
    <>
      <ul className="row-list">
        {switchable.map((p) => {
          const { on, wrongRegion } = packSwitch(p, settings);
          return (
            <li key={p.id} className="row-item">
              <Switch
                label={packLabel(p)}
                hint={wrongRegion ? `${p.region} only` : undefined}
                checked={on}
                disabled={wrongRegion}
                onChange={(checked) => onToggle(p, checked)}
              />
            </li>
          );
        })}
      </ul>
      {hasChecklists && (
        <>
          <h3>Scenario checklists</h3>
          {regional.length === 0 ? (
            <p className="muted">No scenario checklists are available for this region yet.</p>
          ) : (
            <ul className="row-list">
              {regional.map((p) => (
                <li key={p.id} className="row-item">
                  <div>{packLabel(p)}</div>
                  <div className="muted">Included for your region</div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
