import type { Document } from '../../model';

/**
 * Removes a place from a draft of the document and everything that pointed at it: the assets
 * that were kept there lose their `locationId`, and the place's floor entries (keyed
 * `<locationId>|<item>`) go too.
 */
export function deleteLocation(draft: Document, id: string): void {
  delete draft.locations[id];
  for (const a of Object.values(draft.assets)) if (a.locationId === id) delete a.locationId;
  for (const key of Object.keys(draft.floors))
    if (key.startsWith(`${id}|`)) delete draft.floors[key];
}
