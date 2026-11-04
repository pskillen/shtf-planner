import { useRegisterSW } from 'virtual:pwa-register/react';

/** "Update available, reload": shown when a new service worker has installed and is waiting. */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  const reload = () => {
    void updateServiceWorker(true);
    // The worker does not claim clients, so on a first-ever visit this page is uncontrolled and
    // the library's own reload (on controllerchange) never fires: reload it ourselves.
    if (!navigator.serviceWorker?.controller) window.location.reload();
  };
  return (
    <div className="toast" role="status">
      <span>Update available.</span>
      <button type="button" onClick={reload}>
        Reload
      </button>
      <button type="button" className="quiet" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  );
}
