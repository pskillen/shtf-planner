import type { SyncState, SyncStatus } from '../../store';

/** "14:05", in the person's own locale and zone. */
export function clock(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const edits = (n: number) => (n === 1 ? '1 edit' : `${n} edits`);

export interface PillText {
  /** A glyph, decorative. */
  icon: string;
  /** Short, for the top bar. */
  short: string;
  /** The full sentence, for the Data screen and the accessible name. */
  long: string;
  tone: 'ok' | 'busy' | 'warn' | 'off';
}

/** What the status pill and the Data screen say for each state. One place, so they agree. */
export function describeStatus(status: SyncStatus): PillText {
  switch (status.kind) {
    case 'disconnected':
      return {
        icon: '☁',
        short: 'Not synced',
        long: 'Not connected to Google Drive. Your plan is only on this device.',
        tone: 'off',
      };
    case 'synced':
      return {
        icon: '✓',
        short: `Synced ${clock(status.at)}`.trim(),
        long: `Up to date with Google Drive as of ${clock(status.at)}.`,
        tone: 'ok',
      };
    case 'pending':
      return {
        icon: '●',
        short: edits(status.edits) + ' to send',
        long: `${edits(status.edits)} not on Google Drive yet (since ${clock(status.since)}). They are sent a few seconds after you stop editing.`,
        tone: 'busy',
      };
    case 'pushing':
      return {
        icon: '↑',
        short: 'Saving…',
        long: 'Sending your changes to Google Drive.',
        tone: 'busy',
      };
    case 'pulling':
      return {
        icon: '↓',
        short: 'Checking…',
        long: 'Looking for changes on Google Drive.',
        tone: 'busy',
      };
    case 'remoteNewer':
      return {
        icon: '!',
        short: 'Needs your answer',
        long: 'Google Drive has changes that need your answer before they can be applied.',
        tone: 'warn',
      };
    case 'offline': {
      const waiting = status.edits > 0 ? `, ${edits(status.edits)} waiting` : '';
      return {
        icon: '⌁',
        short: `Offline${waiting ? ` · ${status.edits}` : ''}`,
        long: `Offline since ${clock(status.since)}${waiting}. They are sent when you are back online.`,
        tone: 'warn',
      };
    }
    case 'error':
      return {
        icon: '!',
        short: status.reconnect ? 'Reconnect Drive' : 'Sync problem',
        long: status.message,
        tone: 'warn',
      };
  }
}

/** True when there is something for the person to answer or fix. */
export function needsAttention(state: SyncState): boolean {
  return (
    state.conflicts.length > 0 ||
    state.envWarning !== null ||
    state.firstConnect ||
    state.status.kind === 'error'
  );
}
