import { app, el } from './ui';

const routes: Record<string, () => Promise<{ mount: (root: HTMLElement) => void }>> = {
  '/barcode': () => import('./spikes/barcode'),
  '/crdt': () => import('./spikes/crdt'),
  '/drive': () => import('./spikes/drive'),
  '/env': () => import('./spikes/env'),
  '/date': () => import('./spikes/date'),
  '/stocktake': () => import('./spikes/stocktake'),
};

async function render() {
  const path = location.hash.slice(1) || '/';
  const root = app();
  root.replaceChildren();
  const load = routes[path];
  if (!load) {
    root.append(el('p', { textContent: 'Pick a spike above. Build env: ' + (import.meta.env.VITE_BUILD_ENV ?? 'local') }));
    return;
  }
  (await load()).mount(root);
}
addEventListener('hashchange', render);
render();
