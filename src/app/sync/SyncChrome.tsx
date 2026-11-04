import { useEffect } from 'react';
import type { Conflict } from '../../store';
import { useStoreStatusIfOpen, useSync, useSyncState } from '../state';
import './sync.css';

function show(value: unknown): string {
  if (value === undefined) return '(not set)';
  if (typeof value === 'string') return value === '' ? '(empty)' : value;
  return JSON.stringify(value);
}

function ConflictCard({
  conflict,
  onChoose,
}: {
  conflict: Conflict;
  onChoose: (side: 'mine' | 'theirs') => void;
}) {
  return (
    <li className="conflict-card" data-testid="conflict-card">
      <h3>
        {conflict.noun}: {conflict.title}
      </h3>
      {!conflict.minePresent && (
        <p className="muted">Deleted on this device, edited on the other.</p>
      )}
      {!conflict.theirsPresent && (
        <p className="muted">Edited on this device, deleted on the other.</p>
      )}
      <table>
        <thead>
          <tr>
            <th scope="col">What</th>
            <th scope="col">This device</th>
            <th scope="col">Other device</th>
          </tr>
        </thead>
        <tbody>
          {conflict.fields.map((f) => (
            <tr key={f.field}>
              <th scope="row">{f.field}</th>
              <td>{show(f.mine)}</td>
              <td>{show(f.theirs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button type="button" onClick={() => onChoose('mine')}>
          Keep mine
        </button>
        <button type="button" onClick={() => onChoose('theirs')}>
          Take theirs
        </button>
      </div>
    </li>
  );
}

/** The which-copy dialog: one card per record both devices changed. */
function WhichCopyDialog() {
  const sync = useSync();
  const { conflicts } = useSyncState();
  if (!sync || conflicts.length === 0) return null;
  return (
    <div className="sync-backdrop">
      <div className="sync-dialog" role="dialog" aria-modal="true" aria-labelledby="which-copy">
        <h2 id="which-copy">Two devices changed the same thing</h2>
        <p>
          Everything else has been merged. For these, choose which copy to keep; the other is
          replaced on both devices.
        </p>
        <ul className="conflict-list">
          {conflicts.map((c) => (
            <ConflictCard
              key={c.key}
              conflict={c}
              onChoose={(side) => void sync.resolveConflicts({ [c.key]: side })}
            />
          ))}
        </ul>
        <div className="row">
          <button type="button" className="quiet" onClick={() => void sync.resolveAll('mine')}>
            Keep all mine
          </button>
          <button type="button" className="quiet" onClick={() => void sync.resolveAll('theirs')}>
            Take all theirs
          </button>
        </div>
      </div>
    </div>
  );
}

/** True when either side is not production: then the person is shown which is which. */
const envsDiffer = (fileEnv: string | null, buildEnv: string) =>
  fileEnv !== null && !(fileEnv === 'prod' && buildEnv === 'prod');

/** "This household file was last written by next; you are on next." */
export function EnvLine({ fileEnv, buildEnv }: { fileEnv: string | null; buildEnv: string }) {
  if (!fileEnv || !envsDiffer(fileEnv, buildEnv)) return null;
  return (
    <p className="env-line" data-testid="env-line">
      This household file was last written by <strong>{fileEnv}</strong>; you are on{' '}
      <strong>{buildEnv}</strong>.
    </p>
  );
}

/** First connect on a device that already has answers, to a Drive that has a household. */
function FirstConnectDialog() {
  const sync = useSync();
  const { firstConnect, fileEnv, buildEnv } = useSyncState();
  if (!sync || !firstConnect) return null;
  return (
    <div className="sync-backdrop">
      <div className="sync-dialog" role="dialog" aria-modal="true" aria-labelledby="first-connect">
        <h2 id="first-connect">Found a household on Google Drive</h2>
        <p>
          This device already has a plan, and so does your Drive. Merging keeps both: nothing is
          deleted, and anything you both changed is shown for you to choose.
        </p>
        <EnvLine fileEnv={fileEnv} buildEnv={buildEnv} />
        <div className="row">
          <button type="button" onClick={() => void sync.resolveFirstConnect('merge')}>
            Merge them
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => void sync.resolveFirstConnect('cancel')}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

/** A pull brought in a file last written by a different build: ask before merging it. */
export function EnvDialog() {
  const sync = useSync();
  const { envWarning } = useSyncState();
  if (!sync || !envWarning) return null;
  return (
    <div className="sync-backdrop">
      <div
        className="sync-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="env-dialog"
        data-testid="env-dialog"
      >
        <h2 id="env-dialog">Another version&rsquo;s household</h2>
        <EnvLine fileEnv={envWarning.fileEnv} buildEnv={envWarning.buildEnv} />
        <p>Merging mixes test and real data.</p>
        <div className="row">
          <button type="button" onClick={() => void sync.resolveEnv('continue')}>
            Continue
          </button>
          <button type="button" className="quiet" onClick={() => void sync.resolveEnv('dont-sync')}>
            Don&rsquo;t sync
          </button>
        </div>
      </div>
    </div>
  );
}

/** The household on this device (or on Drive) is from a newer version of the app. */
function NewerVersionBanner() {
  const store = useStoreStatusIfOpen();
  const { status } = useSyncState();
  const remoteNewer = status.kind === 'error' && /newer version/.test(status.message);
  if (store.kind !== 'too-new' && !remoteNewer) return null;
  return (
    <div className="sync-banner" role="alert" data-testid="newer-banner">
      <p>
        {store.kind === 'too-new'
          ? 'This household was saved by a newer version of the app. Update this device to edit it.'
          : 'Your other device runs a newer version; update this one. Nothing was merged.'}
      </p>
    </div>
  );
}

/** A short message after a pull ("3 changes from your other device"). */
function SyncToast() {
  const sync = useSync();
  const { notice } = useSyncState();
  const id = notice?.id;
  useEffect(() => {
    if (id === undefined || !sync) return;
    const t = setTimeout(() => sync.dismissNotice(), 6000);
    return () => clearTimeout(t);
  }, [id, sync]);
  if (!sync || !notice) return null;
  return (
    <div className="toast sync-toast" role="status" data-testid="sync-toast">
      <span>{notice.text}</span>
      <button type="button" className="quiet" onClick={() => sync.dismissNotice()}>
        OK
      </button>
    </div>
  );
}

/** Everything sync may need to say outside the Data screen: banners, dialogs, the toast. */
export function SyncChrome() {
  return (
    <>
      <EnvDialog />
      <NewerVersionBanner />
      <WhichCopyDialog />
      <FirstConnectDialog />
      <SyncToast />
    </>
  );
}
