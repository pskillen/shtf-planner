import type { Packs } from '../model';
import { bundledPacks } from '../packs';

/** The bundled packs: items come only from the pack, so the household adds nothing to them. */
export function usePacks(): Packs {
  return bundledPacks();
}
