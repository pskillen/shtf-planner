import { Link } from 'react-router-dom';
import { useSync, useSyncState } from '../state';
import { describeStatus } from './syncText';
import './sync.css';

/**
 * The sync status in the top bar, on every app screen. Tapping it opens the Data screen, except
 * when Drive needs reconnecting: then it is the Reconnect button itself, one tap to Google's window.
 */
export function SyncPill() {
  const state = useSyncState();
  const sync = useSync();
  const text = describeStatus(state.status);
  const className = `sync-pill sync-${text.tone}`;
  const label = `Sync status: ${text.long}`;
  const body = (
    <>
      <span aria-hidden="true">{text.icon}</span>
      <span className="sync-pill-text">{text.short}</span>
    </>
  );
  if (state.status.kind === 'error' && state.status.reconnect && state.connected) {
    return (
      <button
        type="button"
        className={`${className} sync-pill-button`}
        aria-label={`${label} Tap to reconnect.`}
        data-testid="sync-pill"
        data-status={state.status.kind}
        disabled={!sync}
        onClick={() => void sync?.connect()}
      >
        {body}
      </button>
    );
  }
  return (
    <Link
      to="/app/more/data"
      className={className}
      aria-label={label}
      data-testid="sync-pill"
      data-status={state.status.kind}
    >
      {body}
    </Link>
  );
}
