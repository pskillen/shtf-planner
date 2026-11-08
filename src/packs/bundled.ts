import assetsBase from './data/assets-base.json';
import checklistsUk from './data/checklists-uk.json';
import guidanceGridFree from './data/guidance-grid-free.json';
import guidanceUkPrepare from './data/guidance-uk-prepare.json';
import guidanceUsReady from './data/guidance-us-ready.json';
import itemsBase from './data/items-base.json';
import plansBase from './data/plans-base.json';
import regions from './data/regions.json';
import { loadPacks, type Packs } from './loader';

/** The packs shipped in the bundle (so they work offline). Order is the default pack order. */
export const BUNDLED_PACK_FILES: ReadonlyArray<{ label: string; raw: unknown }> = [
  { label: 'items-base.json', raw: itemsBase },
  { label: 'assets-base.json', raw: assetsBase },
  { label: 'guidance-grid-free.json', raw: guidanceGridFree },
  { label: 'guidance-uk-prepare.json', raw: guidanceUkPrepare },
  { label: 'guidance-us-ready.json', raw: guidanceUsReady },
  { label: 'plans-base.json', raw: plansBase },
  { label: 'regions.json', raw: regions },
  { label: 'checklists-uk.json', raw: checklistsUk },
];

let cached: Packs | undefined;

/** Loads and validates the bundled packs once. Throws `PackError` if one is broken. */
export function bundledPacks(): Packs {
  cached ??= loadPacks(BUNDLED_PACK_FILES);
  return cached;
}
