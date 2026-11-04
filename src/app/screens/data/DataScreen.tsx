import { useRef, useState } from 'react';
import { clock, describeStatus } from '../../sync/syncText';
import { forgetThisDevice, useStoreFiles, useSync, useSyncState } from '../../state';
import '../../sync/sync.css';
import {
  download,
  jsonExport,
  previewImport,
  yamlExport,
  type ImportPreview,
} from './exportImport';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function DriveSection() {
  const sync = useSync();
  const state = useSyncState();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const text = describeStatus(state.status);

  if (!state.configured && !state.connected) {
    return (
      <section className="data-section" aria-labelledby="drive-h">
        <h2 id="drive-h">Google Drive</h2>
        <p className="muted">
          Drive sync is not set up in this build, so your plan stays on this device. You can still
          export and import it below.
        </p>
      </section>
    );
  }

  return (
    <section className="data-section" aria-labelledby="drive-h">
      <h2 id="drive-h">Google Drive</h2>
      <p className="muted">
        Your plan is kept in a folder called &ldquo;SHTF Planner&rdquo; in your own Google Drive,
        and the app can only see what it put there.
      </p>
      <p className="data-status" role="status" data-testid="data-status">
        {state.connected && state.account ? <>Connected as {state.account}. </> : null}
        {text.long}
        {state.checkedAt ? ` Last looked at Drive at ${clock(state.checkedAt)}.` : ''}
      </p>
      <div className="row">
        {!state.connected || state.status.kind === 'error' ? (
          <button type="button" disabled={!sync} onClick={() => void sync?.connect()}>
            {state.connected ? 'Reconnect Google Drive' : 'Connect Google Drive'}
          </button>
        ) : null}
        {state.connected ? (
          <>
            <button type="button" disabled={!sync} onClick={() => void sync?.checkDrive()}>
              Check Drive
            </button>
            <button type="button" disabled={!sync} onClick={() => void sync?.flush()}>
              Push now
            </button>
            {confirmDisconnect ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDisconnect(false);
                    void sync?.disconnect();
                  }}
                >
                  Yes, disconnect
                </button>
                <button type="button" className="quiet" onClick={() => setConfirmDisconnect(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="quiet" onClick={() => setConfirmDisconnect(true)}>
                Disconnect
              </button>
            )}
          </>
        ) : null}
      </div>
      {confirmDisconnect ? (
        <p className="muted">
          Disconnecting stops syncing on this device. Your plan here and the files on Drive are left
          as they are.
        </p>
      ) : null}
    </section>
  );
}

function ExportSection() {
  const files = useStoreFiles();
  return (
    <section className="data-section" aria-labelledby="export-h">
      <h2 id="export-h">Export</h2>
      <p className="muted">A copy of your whole plan, to keep or to read.</p>
      <div className="row">
        <button type="button" onClick={() => download(jsonExport(files.export()))}>
          Download JSON
        </button>
        <button type="button" onClick={() => download(yamlExport(files.export()))}>
          Download YAML
        </button>
      </div>
    </section>
  );
}

function ImportSection() {
  const files = useStoreFiles();
  const sync = useSync();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    setDone(null);
    if (!file) return setPreview(null);
    setPreview(previewImport(await file.text()));
  };
  const reset = () => {
    setPreview(null);
    if (input.current) input.current.value = '';
  };
  const confirm = () => {
    if (!preview?.ok) return;
    try {
      files.importJson(preview.json, 'replace');
    } catch (e) {
      setPreview({ ok: false, error: e instanceof Error ? e.message : String(e) });
      return;
    }
    reset();
    setDone('Imported. Your plan on this device was replaced.');
    void sync?.flush();
  };

  return (
    <section className="data-section" aria-labelledby="import-h">
      <h2 id="import-h">Import</h2>
      <p className="muted">
        Replace the plan on this device with an export (JSON or YAML). If Drive is connected, the
        result is sent there too.
      </p>
      <input
        ref={input}
        type="file"
        accept=".json,.yaml,.yml,application/json,application/yaml,text/yaml"
        aria-label="Choose an export file"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {preview && !preview.ok ? (
        <p className="data-error" role="alert">
          {preview.error}
        </p>
      ) : null}
      {preview?.ok ? (
        <div data-testid="import-preview">
          <p>This file has:</p>
          <ul className="import-preview">
            <li>{plural(preview.summary.members, 'person', 'people')}</li>
            <li>{plural(preview.summary.pets, 'pet')}</li>
            <li>{plural(preview.summary.locations, 'location')}</li>
            <li>{plural(preview.summary.assets, 'asset')}</li>
            <li>{plural(preview.summary.items, 'item')}</li>
          </ul>
          <p>Importing replaces everything on this device.</p>
          <div className="row">
            <button type="button" onClick={confirm}>
              Replace my plan
            </button>
            <button type="button" className="quiet" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {done ? (
        <p role="status" data-testid="import-done">
          {done}
        </p>
      ) : null}
    </section>
  );
}

function ForgetSection() {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const forget = async () => {
    setBusy(true);
    try {
      await forgetThisDevice();
    } finally {
      window.location.assign('/app/more/data');
    }
  };
  return (
    <section className="data-section" aria-labelledby="forget-h">
      <h2 id="forget-h">Forget this device&rsquo;s data</h2>
      <p className="muted">
        Deletes the plan stored in this browser and signs out of Drive here. Anything already on
        Google Drive stays there, and you can connect again to get it back.
      </p>
      {asking ? (
        <div className="row">
          <button type="button" disabled={busy} onClick={() => void forget()}>
            Yes, delete it from this device
          </button>
          <button type="button" className="quiet" disabled={busy} onClick={() => setAsking(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="quiet" onClick={() => setAsking(true)}>
          Forget this device&rsquo;s data
        </button>
      )}
    </section>
  );
}

/** More, Data: Drive sync, export, import, and clearing this device. */
export function DataScreen() {
  return (
    <section className="screen">
      <h1>Data</h1>
      <DriveSection />
      <ExportSection />
      <ImportSection />
      <ForgetSection />
    </section>
  );
}
