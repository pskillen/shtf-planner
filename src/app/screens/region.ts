import type { Document, Region, RegionDef } from '../../model';

export interface RiskLink {
  risk: string;
  label: string;
  url: string;
}

/**
 * The links to check a risk, for a region and (for the UK) a subregion. A subregion's own links
 * replace the region's for the same risk (Scotland's flood link is SEPA's, not the Environment
 * Agency's); every other region link stays. A subregion without links of its own (England, Wales,
 * Northern Ireland, for now) adds nothing: no link is invented.
 */
export function riskLinksFor(
  def: RegionDef | undefined,
  subregion: string | undefined,
): RiskLink[] {
  if (!def) return [];
  const own = def.subregions?.find((s) => s.id === subregion)?.riskLinks ?? [];
  const replaced = new Set(own.map((l) => l.risk));
  return [...def.riskLinks.filter((l) => !replaced.has(l.risk)), ...own];
}

/**
 * Sets the region everywhere it is kept: the home and the settings agree. The subregion only
 * means something in the UK, so a US household drops it.
 */
export function applyRegion(draft: Document, region: Region): void {
  draft.home.region = region;
  draft.settings.region = region;
  if (region !== 'UK') delete draft.home.subregion;
}

/** Heating and cooking both on electricity and no gas supply: a power cut loses both. */
export function isAllElectric(
  home: Pick<Document['home'], 'heating' | 'cooking' | 'mainsGas'>,
): boolean {
  return (
    !home.mainsGas &&
    (home.heating === 'electric' || home.heating === 'heat-pump') &&
    (home.cooking === 'electric' || home.cooking === 'induction')
  );
}
