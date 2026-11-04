import { Link } from 'react-router-dom';

/** Settings' entry to Export, import and Google Drive, which live on their own screen. */
export function DataSection() {
  return (
    <section aria-labelledby="data-heading">
      <h2 id="data-heading">Your data</h2>
      <p className="muted">Export, import, Google Drive sync, and clearing this device.</p>
      <Link to="/app/more/data" className="card">
        <span className="card-title">Data and Google Drive</span>
        <span className="card-body">Sync between devices, download a copy, import one</span>
        <span className="card-go" aria-hidden="true">
          ›
        </span>
      </Link>
    </section>
  );
}
