import { useRegisterSW } from 'virtual:pwa-register/react';

/** "Update available, reload": shown when a new service worker has installed and is waiting. */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;
  return (
    <div className="toast" role="status">
      <span>Update available.</span>
      <button type="button" onClick={() => void updateServiceWorker(true)}>
        Reload
      </button>
      <button type="button" className="quiet" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  );
}
