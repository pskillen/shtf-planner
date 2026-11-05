import { useState } from 'react';
import { download, jsonExport } from './screens/data/exportImport';
import { startFreshHousehold, useStoreFiles } from './state';

/** Full-screen gate when this device's household is from before the stock model (schema 4). */
export function TooOld() {
  const files = useStoreFiles();
  const [confirmFresh, setConfirmFresh] = useState(false);
  const [busy, setBusy] = useState(false);

  const downloadCopy = () => {
    download(jsonExport(files.export(), undefined, __BUILD_ENV__));
  };

  const startFresh = async () => {
    setBusy(true);
    try {
      await startFreshHousehold();
    } catch {
      setBusy(false);
    }
  };

  return (
    <section className="screen">
      <h1>Household from an older version</h1>
      <p>
        This household was made by an older version of SHTF Planner. This version keeps items,
        products and stock differently and cannot open it.
      </p>
      <div className="row">
        <button type="button" onClick={downloadCopy}>
          Download a copy
        </button>
      </div>
      {confirmFresh ? (
        <>
          <p className="note">
            This deletes the household on this device. Google Drive is not touched yet.
          </p>
          <div className="row">
            <button type="button" disabled={busy} onClick={() => void startFresh()}>
              Start a new household
            </button>
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() => setConfirmFresh(false)}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="row">
          <button type="button" className="quiet" onClick={() => setConfirmFresh(true)}>
            Start a new household
          </button>
        </div>
      )}
    </section>
  );
}
