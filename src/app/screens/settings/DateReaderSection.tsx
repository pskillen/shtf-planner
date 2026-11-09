import { useEffect, useState } from 'react';
import {
  getDateReader,
  peekDateReader,
  releaseDateReader,
  terminateDateReader,
} from '../../../scan/ocr/client';
import { READER_DOWNLOAD_MB, readerDownloaded } from '../../../scan/ocr/cache';
import { readUseWebGpu } from '../stores/dateSettings';

type Note = 'failed' | 'not-kept' | null;

/** Whether the date reader is on this device, and a button to fetch it before going offline. */
export function DateReaderSection() {
  const [downloaded, setDownloaded] = useState<boolean | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [online, setOnline] = useState(() => navigator.onLine !== false);

  useEffect(() => {
    let live = true;
    void readerDownloaded().then((d) => live && setDownloaded(d));
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      live = false;
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const download = async () => {
    setBusy(true);
    setNote(null);
    const had = peekDateReader();
    try {
      await getDateReader(readUseWebGpu()).ready;
    } catch {
      // A failed reader stays in the client until it is stopped: free it so the next tap makes a new one.
      terminateDateReader();
      setNote('failed');
      setBusy(false);
      return;
    }
    if (had) releaseDateReader();
    else terminateDateReader();
    const now = await readerDownloaded();
    setDownloaded(now);
    if (now === false) setNote('not-kept');
    setBusy(false);
  };

  return (
    <section>
      <h2>Date reader</h2>
      {downloaded === undefined ? null : downloaded === true ? (
        <p className="muted">Downloaded: best-before dates can be read offline on this device.</p>
      ) : downloaded === null ? (
        <p className="muted">This browser can’t keep the date reader for offline use.</p>
      ) : (
        <>
          <p className="muted">
            Not downloaded yet. It downloads the first time a date is read (about{' '}
            {READER_DOWNLOAD_MB} MB).
          </p>
          <button type="button" disabled={busy || !online} onClick={() => void download()}>
            {busy ? 'Downloading…' : 'Download the date reader now'}
          </button>
          {!online && <p className="muted">Connect to the internet to download it.</p>}
        </>
      )}
      {note === 'failed' && (
        <p role="alert">Couldn’t download it. Check the connection and try again.</p>
      )}
      {note === 'not-kept' && (
        <p role="alert">
          Downloaded for now, but this page can’t keep it yet. Reload the app and try again.
        </p>
      )}
    </section>
  );
}
