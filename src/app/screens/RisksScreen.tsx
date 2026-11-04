import { LOCAL_RISKS } from '../../model';
import { bundledPacks } from '../../packs';
import { ChipGroup } from '../components/controls';
import { ScreenHeader } from '../components/ScreenHeader';
import { LOCAL_RISK_LABEL } from '../labels';
import { useChange, useDocument } from '../state';
import { riskLinksFor } from './region';

/** What could go wrong where you live, with a link to check each one for your region. */
export function RisksScreen({ embedded = false }: { embedded?: boolean }) {
  const { home } = useDocument();
  const change = useChange();
  const def = bundledPacks().regions[home.region];
  const links = riskLinksFor(def, home.subregion).filter((l) =>
    (home.risks as readonly string[]).includes(l.risk),
  );

  return (
    <div>
      {embedded ? <h1>What could affect you?</h1> : <ScreenHeader title="Risks" />}
      <p className="muted">
        Pick everything that applies. Each one changes how much the plan asks you to keep.
      </p>
      <ChipGroup
        label="Local risks"
        options={LOCAL_RISKS.map((r) => ({ value: r, label: LOCAL_RISK_LABEL[r] }))}
        value={home.risks}
        onChange={(risks) =>
          change('risks', (d) => {
            d.home.risks = LOCAL_RISKS.filter((r) => risks.includes(r));
          })
        }
      />
      {links.length > 0 ? (
        <>
          <h2>Check your area</h2>
          <ul className="link-list">
            {links.map((l) => (
              <li key={`${l.risk}|${l.url}`}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {LOCAL_RISK_LABEL[l.risk as keyof typeof LOCAL_RISK_LABEL]}: {l.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
