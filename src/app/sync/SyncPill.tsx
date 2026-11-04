import { Link } from 'react-router-dom';
import { useSyncState } from '../state';
import { describeStatus } from './syncText';
import './sync.css';

/** The sync status in the top bar, on every app screen. Tapping it opens the Data screen. */
export function SyncPill() {
  const state = useSyncState();
  const text = describeStatus(state.status);
  return (
    <Link
      to="/app/more/data"
      className={`sync-pill sync-${text.tone}`}
      aria-label={`Sync status: ${text.long}`}
      data-testid="sync-pill"
      data-status={state.status.kind}
    >
      <span aria-hidden="true">{text.icon}</span>
      <span className="sync-pill-text">{text.short}</span>
    </Link>
  );
}
