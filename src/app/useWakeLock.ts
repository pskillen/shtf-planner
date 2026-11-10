import { useEffect } from 'react';

interface Sentinel {
  release(): Promise<void>;
}

/**
 * Keeps the screen on while `active` and the page is visible (Screen Wake Lock, where the browser
 * has it). The browser drops the lock when the page hides, so it is asked for again when the page
 * comes back. Released on cleanup or when `active` turns false. Silently nothing elsewhere.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let sentinel: Sentinel | null = null;
    let gone = false;

    const drop = (s: Sentinel | null): void => {
      try {
        void s?.release().catch(() => undefined);
      } catch {
        // Already released.
      }
    };

    const ask = (): void => {
      try {
        if (sentinel || document.visibilityState === 'hidden') return;
        const lock = (
          navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<Sentinel> } }
        ).wakeLock;
        if (!lock) return;
        void lock.request('screen').then(
          (s) => {
            if (gone) drop(s);
            else sentinel = s;
          },
          () => undefined,
        );
      } catch {
        // No wake lock here.
      }
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') ask();
      else sentinel = null; // the browser has dropped it
    };

    ask();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVisibility);
      drop(sentinel);
      sentinel = null;
    };
  }, [active]);
}
