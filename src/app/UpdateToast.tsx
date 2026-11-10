import { useRegisterSW } from 'virtual:pwa-register/react';
import { Toast } from './components/Toast';

/** "Update available, reload": shown when a new service worker has installed and is waiting. */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  const reload = () => {
    void updateServiceWorker(true);
    // The worker claims pages when it first installs, so this only matters for a page that is
    // somehow uncontrolled: the library's own reload (on controllerchange) never fires there, so
    // reload it ourselves.
    if (!navigator.serviceWorker?.controller) window.location.reload();
  };
  return (
    <Toast className="toast-update">
      <span>Update available.</span>
      <button type="button" onClick={reload}>
        Reload
      </button>
      <button type="button" className="quiet" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </Toast>
  );
}
