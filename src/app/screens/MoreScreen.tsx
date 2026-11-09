import { Link } from 'react-router-dom';

/** The More tab: places that are not part of the daily loop. */
export function MoreScreen() {
  return (
    <div>
      <h1>More</h1>
      <div className="cards">
        <Link to="/app/more/checklists" className="card">
          <span className="card-title">Scenario checklists</span>
          <span className="card-body">Step-by-step lists for a power cut, a flood and more</span>
          <span className="card-go" aria-hidden="true">
            ›
          </span>
        </Link>
        <Link to="/app/more/settings" className="card">
          <span className="card-title">Settings</span>
          <span className="card-body">Region, content packs, reminders, your data</span>
          <span className="card-go" aria-hidden="true">
            ›
          </span>
        </Link>
        <Link to="/" className="card">
          <span className="card-title">About this version</span>
          <span className="card-body">The start page and the changelog</span>
          <span className="card-go" aria-hidden="true">
            ›
          </span>
        </Link>
      </div>
    </div>
  );
}
