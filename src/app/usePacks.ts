import { useMemo } from 'react';
import type { Packs } from '../model';
import { bundledPacks, packsFor } from '../packs';
import { useDocument } from './state';

/** The bundled packs with this household's own item types merged in (`custom`). */
export function usePacks(): Packs {
  const { customTypes } = useDocument();
  return useMemo(() => packsFor(bundledPacks(), { customTypes }), [customTypes]);
}
