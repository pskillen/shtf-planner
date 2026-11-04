import { Link } from 'react-router-dom';
import { useStoreStatus } from './state';

/** Full-width notice when the document cannot be edited. Nothing when it is fine. */
export function StoreBanner() {
  const status = useStoreStatus();
  if (status.kind === 'too-new') {
    return (
      <div className="banner" role="alert">
        This household was saved by a newer version of the app. Update this device to keep editing.
      </div>
    );
  }
  if (status.kind === 'invalid') {
    return (
      <div className="banner" role="alert">
        This household could not be read, so it is read-only. Go to{' '}
        <Link to="/app/more/settings">More → Settings → data</Link> to import a copy.
      </div>
    );
  }
  return null;
}
