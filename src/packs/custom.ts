import type { Document, ItemType, ItemsPack, Packs } from '../model';

/** The id of the pseudo-pack that holds the household's own item types. */
export const CUSTOM_PACK_ID = 'custom';

/** A new custom item type's id: `custom:<uuid>`, which satisfies the pack id format. */
export const customTypeId = (uuid: string): string => `${CUSTOM_PACK_ID}:${uuid.toLowerCase()}`;

/** Whether an item type id belongs to the household's own types. */
export const isCustomTypeId = (id: string): boolean => id.startsWith(`${CUSTOM_PACK_ID}:`);

/**
 * The packs with the document's `customTypes` merged in as a pseudo-pack `custom`: its types are
 * in `items` and the pack itself is in `byId`. It is not in `all` or `enabledPacks` (the
 * Settings pack toggles are for shipped content), and a pack's own type is never replaced: a
 * custom id cannot clash, because `custom` is not a shipped pack id.
 *
 * Pure and cheap (one spread of the item catalogue). Pass the result wherever the engine or a
 * screen looks an item type up, so a household's own types count like any other.
 */
export function withCustomTypes(
  packs: Packs,
  customTypes: Readonly<Record<string, ItemType>>,
): Packs {
  const ids = Object.keys(customTypes);
  if (ids.length === 0) return packs;
  const pack: ItemsPack = {
    format: 1,
    id: CUSTOM_PACK_ID,
    version: 1,
    name: 'Your own items',
    kind: 'items',
    items: ids.map((id) => customTypes[id]!),
  };
  return {
    ...packs,
    byId: { ...packs.byId, [CUSTOM_PACK_ID]: pack },
    items: { ...customTypes, ...packs.items },
  };
}

/** `withCustomTypes` for a document. */
export const packsFor = (packs: Packs, doc: Pick<Document, 'customTypes'>): Packs =>
  withCustomTypes(packs, doc.customTypes);
