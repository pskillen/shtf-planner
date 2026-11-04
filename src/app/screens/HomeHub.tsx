import type { ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  LOCAL_RISK_LABEL,
  HEATING_LABEL,
  HOME_TYPE_LABEL,
  INSULATION_LABEL,
  labelOf,
} from '../labels';
import { useDocument } from '../state';
import { firstStepPath } from './onboardingSteps';

function Card({ to, title, children }: { to: string; title: string; children: ReactNode }) {
  return (
    <Link to={to} className="card">
      <span className="card-title">{title}</span>
      <span className="card-body">{children}</span>
      <span className="card-go" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

const HORIZON_LABEL = { 3: '3 days', 7: '7 days', 14: '14 days', 28: '28 days' } as const;

/**
 * The Home tab: the setup hub. A card per part of the household description, each opening its
 * screen. A household with nobody in it yet is sent to the first onboarding step.
 */
export function HomeHub() {
  const doc = useDocument();
  const { members, pets } = doc.household;
  if (members.length === 0) return <Navigate to={firstStepPath} replace />;

  const { home, settings } = doc;
  const assets = Object.keys(doc.assets).length;
  const locations = Object.keys(doc.locations).length;

  return (
    <section className="screen">
      <h1>Your household</h1>
      <p className="muted">Everything the plan is built from. Tap a card to change it.</p>
      <div className="cards">
        <Card to="/app/people" title="People">
          {members.length} {members.length === 1 ? 'person' : 'people'}
          {pets.length > 0 ? `, ${pets.length} ${pets.length === 1 ? 'pet' : 'pets'}` : ''}
          <span className="muted"> · {members.map((m) => m.name).join(', ')}</span>
        </Card>
        <Card to="/app/home" title="Home">
          {labelOf(HOME_TYPE_LABEL, home.type)},{' '}
          {labelOf(HEATING_LABEL, home.heating).toLowerCase()} heating
          <span className="muted">
            {' '}
            · insulation {labelOf(INSULATION_LABEL, home.insulation).toLowerCase()}
          </span>
        </Card>
        <Card to="/app/locations" title="Locations">
          {locations === 0 ? 'None yet' : `${locations} ${locations === 1 ? 'place' : 'places'}`}
        </Card>
        <Card to="/app/assets" title="Equipment">
          {assets === 0 ? 'None yet' : `${assets} ${assets === 1 ? 'item' : 'items'}`}
        </Card>
        <Card to="/app/risks" title="Risks">
          {home.risks.length === 0 ? (
            'None chosen'
          ) : (
            <span className="chips-inline">
              {home.risks.map((r) => (
                <span className="chip static" key={r}>
                  {labelOf(LOCAL_RISK_LABEL, r)}
                </span>
              ))}
            </span>
          )}
        </Card>
        <Card to="/app/horizon" title="How long to plan for">
          {labelOf(HORIZON_LABEL, String(settings.horizonDays), `${settings.horizonDays} days`)}
        </Card>
      </div>
    </section>
  );
}
