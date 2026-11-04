import {
  PackSchema,
  type AssetType,
  type ItemType,
  type Meta,
  type Pack,
  type PlanDef,
  type Region,
  type RegionDef,
  type Rule,
  type Settings,
} from '../model';

/** A pack failed validation or a reference did not resolve. `issues` has one line each. */
export class PackError extends Error {
  readonly issues: string[];
  constructor(label: string, issues: string[]) {
    super(`Pack ${label} is invalid:\n  - ${issues.join('\n  - ')}`);
    this.name = 'PackError';
    this.issues = issues;
  }
}

/** The loaded packs, indexed for lookup. Things from every loaded pack, enabled or not. */
export interface Packs {
  all: readonly Pack[];
  byId: Readonly<Record<string, Pack>>;
  items: Readonly<Record<string, ItemType>>;
  assets: Readonly<Record<string, AssetType>>;
  rules: Readonly<Record<string, Rule>>;
  plans: Readonly<Record<string, PlanDef>>;
  regions: Readonly<Partial<Record<Region, RegionDef>>>;
  /**
   * The packs a household uses: those in `settings.packs` (in that order), minus any whose
   * `region` is not `settings.region`. Unknown ids are skipped.
   */
  enabledPacks(settings: Pick<Settings, 'packs' | 'region'>): Pack[];
}

function path(p: ReadonlyArray<PropertyKey>): string {
  return p.reduce<string>(
    (s, k) => (typeof k === 'number' ? `${s}[${k}]` : s === '' ? String(k) : `${s}.${String(k)}`),
    '',
  );
}

/** Validates one pack's shape. Throws `PackError` naming the field of every problem. */
export function parsePack(raw: unknown, label = 'file'): Pack {
  const result = PackSchema.safeParse(raw);
  if (result.success) return result.data;
  const id = (raw as { id?: unknown } | null)?.id;
  throw new PackError(
    typeof id === 'string' ? id : label,
    result.error.issues.map((i) => `${path(i.path) || '(pack)'}: ${i.message}`),
  );
}

/**
 * Validates every pack and checks that everything they name resolves: ids are unique and carry
 * their pack's prefix, questions named by contributions exist, a rule's URL source is listed in
 * its pack's `sources` with the date checked, plan items name real asset types, regions name real
 * packs. Throws `PackError` on the first pack with a problem.
 */
export function loadPacks(raws: ReadonlyArray<{ label: string; raw: unknown }>): Packs {
  const all = raws.map(({ label, raw }) => parsePack(raw, label));

  const byId: Record<string, Pack> = {};
  for (const pack of all) {
    if (byId[pack.id]) throw new PackError(pack.id, [`duplicate pack id "${pack.id}"`]);
    byId[pack.id] = pack;
  }

  const items: Record<string, ItemType> = {};
  const assets: Record<string, AssetType> = {};
  const rules: Record<string, Rule> = {};
  const plans: Record<string, PlanDef> = {};
  const regions: Partial<Record<Region, RegionDef>> = {};

  const claim = <T>(
    pack: Pack,
    table: Record<string, T>,
    id: string,
    value: T,
    issues: string[],
    where: string,
  ) => {
    if (!id.startsWith(`${pack.id}:`))
      issues.push(`${where}: id "${id}" must start with "${pack.id}:"`);
    if (table[id]) issues.push(`${where}: duplicate id "${id}"`);
    table[id] = value;
  };

  for (const pack of all) {
    const issues: string[] = [];
    const sourceDates = new Map((pack.sources ?? []).map((s) => [s.url, s.checked]));

    switch (pack.kind) {
      case 'items':
        pack.items.forEach((item, i) => {
          const where = `items[${i}]`;
          claim(pack, items, item.id, item, issues, where);
          item.gives.forEach((g, j) => {
            if (g.store === 'medicationDays')
              issues.push(
                `${where}.gives[${j}]: medicationDays is computed, an item cannot give it`,
              );
          });
        });
        break;
      case 'assets':
        pack.assets.forEach((asset, i) => {
          const where = `assets[${i}]`;
          claim(pack, assets, asset.id, asset, issues, where);
          const questions = new Map(asset.questions.map((q) => [q.id, q]));
          if (questions.size !== asset.questions.length)
            issues.push(`${where}: duplicate question id`);
          asset.questions.forEach((q, j) => {
            if (q.kind === 'choice' && !(q.choices && q.choices.length > 0))
              issues.push(`${where}.questions[${j}]: a choice question needs choices`);
          });
          const needQuestion = (id: string | undefined, at: string, kind?: string) => {
            if (id === undefined) return;
            const q = questions.get(id);
            if (!q) issues.push(`${at}: question "${id}" does not exist on ${asset.id}`);
            else if (kind && q.kind !== kind)
              issues.push(`${at}: question "${id}" must be a ${kind} question`);
          };
          asset.contributes.forEach((c, j) => {
            const at = `${where}.contributes[${j}]`;
            needQuestion(c.when?.question, `${at}.when`);
            needQuestion(c.storesWh?.fromQuestion, `${at}.storesWh`, 'number');
            needQuestion(c.converts?.perHourFrom, `${at}.converts`, 'number');
            needQuestion(c.providesPerDayFrom?.question, `${at}.providesPerDayFrom`, 'number');
            if (typeof c.outputPerHour === 'object')
              needQuestion(c.outputPerHour.fromQuestion, `${at}.outputPerHour`, 'number');
            if (
              c.converts &&
              (c.converts.perHour === undefined) === (c.converts.perHourFrom === undefined)
            )
              issues.push(`${at}.converts: give exactly one of perHour and perHourFrom`);
          });
          const mids = asset.maintenance.map((m) => m.id);
          if (new Set(mids).size !== mids.length) issues.push(`${where}: duplicate maintenance id`);
        });
        break;
      case 'guidance':
        if (pack.horizonBands.some((d, i, a) => i > 0 && d <= a[i - 1]!))
          issues.push('horizonBands must be strictly ascending');
        pack.rules.forEach((rule, i) => {
          const where = `rules[${i}]`;
          claim(pack, rules, rule.id, rule, issues, where);
          if (rule.source !== 'assumption' && !sourceDates.has(rule.source))
            issues.push(
              `${where}: source ${rule.source} is not listed in the pack's sources (with the date checked)`,
            );
        });
        break;
      case 'plans':
        pack.items.forEach((item, i) => claim(pack, plans, item.id, item, issues, `items[${i}]`));
        break;
      case 'regions':
        pack.regions.forEach((region, i) => {
          if (regions[region.id]) issues.push(`regions[${i}]: duplicate region ${region.id}`);
          regions[region.id] = region;
        });
        break;
    }
    if (issues.length > 0) throw new PackError(pack.id, issues);
  }

  // References across packs, once everything is indexed.
  for (const pack of all) {
    const issues: string[] = [];
    if (pack.kind === 'plans') {
      pack.items.forEach((item, i) =>
        item.requires?.asset?.forEach((a) => {
          if (!assets[a])
            issues.push(`items[${i}].requires.asset: asset type "${a}" does not exist`);
        }),
      );
    }
    if (pack.kind === 'regions') {
      pack.regions.forEach((region, i) =>
        region.suggestedPacks.forEach((p) => {
          if (!byId[p]) issues.push(`regions[${i}].suggestedPacks: pack "${p}" does not exist`);
        }),
      );
    }
    if (issues.length > 0) throw new PackError(pack.id, issues);
  }

  return {
    all,
    byId,
    items,
    assets,
    rules,
    plans,
    regions,
    enabledPacks(settings) {
      const out: Pack[] = [];
      for (const id of settings.packs) {
        const pack = byId[id];
        if (pack && (pack.region === undefined || pack.region === settings.region)) out.push(pack);
      }
      return out;
    },
  };
}

/** Pack versions the document has not recorded, and those that differ from what it recorded. */
export function packVersionReport(
  meta: Pick<Meta, 'packVersions'>,
  packs: Packs,
  settings: Pick<Settings, 'packs' | 'region'>,
): {
  unrecorded: string[];
  mismatched: { id: string; recorded: number; loaded: number }[];
} {
  const unrecorded: string[] = [];
  const mismatched: { id: string; recorded: number; loaded: number }[] = [];
  for (const pack of packs.enabledPacks(settings)) {
    const recorded = meta.packVersions[pack.id];
    if (recorded === undefined) unrecorded.push(pack.id);
    else if (recorded !== pack.version)
      mismatched.push({ id: pack.id, recorded, loaded: pack.version });
  }
  return { unrecorded, mismatched };
}

/**
 * Records the version of each enabled pack the document has not used before. Call it inside a
 * `change`. A mismatch with an earlier recording is reported (`packVersionReport`), not fatal, and
 * is left as recorded.
 */
export function recordPackVersions(draft: { meta: Meta; settings: Settings }, packs: Packs): void {
  for (const pack of packs.enabledPacks(draft.settings)) {
    if (draft.meta.packVersions[pack.id] === undefined) {
      draft.meta.packVersions[pack.id] = pack.version;
    }
  }
}
