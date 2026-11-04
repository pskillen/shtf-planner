import type { Document, Region } from '../../../model';

/** What the Settings screen needs to draw one content pack's switch. */
export interface PackSwitch {
  /** On means it is in the household's list and is for this region (or for every region). */
  on: boolean;
  /** A pack for the other region: shown off and cannot be changed. */
  wrongRegion: boolean;
}

export function packSwitch(
  pack: { id: string; region?: Region },
  settings: Pick<Document['settings'], 'region' | 'packs'>,
): PackSwitch {
  const wrongRegion = pack.region !== undefined && pack.region !== settings.region;
  return { wrongRegion, on: settings.packs.includes(pack.id) && !wrongRegion };
}

/** Turns a pack on or off in a draft of the document. A pack for the other region is left alone. */
export function setPack(draft: Document, pack: { id: string; region?: Region }, on: boolean): void {
  if (packSwitch(pack, draft.settings).wrongRegion) return;
  const rest = draft.settings.packs.filter((id) => id !== pack.id);
  draft.settings.packs = on ? [...rest, pack.id] : rest;
}
