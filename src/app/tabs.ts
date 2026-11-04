/** The bottom tabs, in order. `path` is relative to `/app`; Home is the empty path. */
export const TABS = [
  { path: '', label: 'Home', icon: '⌂' },
  { path: 'stores', label: 'Stores', icon: '▤' },
  { path: 'gaps', label: 'Gaps', icon: '△' },
  { path: 'score', label: 'Score', icon: '★' },
  { path: 'more', label: 'More', icon: '≡' },
] as const;

export type TabPath = (typeof TABS)[number]['path'];

/**
 * Which tab a location belongs to. Stores, Gaps, Score and More own their own paths and what is
 * under them (More → Settings); every other screen of the app, such as People or Locations, is
 * reached from the Home hub and counts as Home.
 */
export function activeTab(pathname: string): TabPath {
  const [, , first = ''] = pathname.split('/');
  const own = TABS.find((t) => t.path !== '' && t.path === first);
  return own ? own.path : '';
}

/** First-run setup is a guided flow of its own: no tabs to leave it by. */
export const showsTabs = (pathname: string): boolean => !/^\/app\/setup(\/|$)/.test(pathname);
