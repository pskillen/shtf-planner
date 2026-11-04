import { parse, stringify } from 'yaml';
import { bringForward } from '../../../store';

export interface ExportFile {
  filename: string;
  text: string;
  mime: string;
}

/** "2026-11-04", in the person's own zone. */
export function localDate(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** `household-YYYY-MM-DD`, with the build's environment in front of the date unless it is prod. */
const baseName = (now?: Date, env?: string) =>
  `household-${env && env !== 'prod' ? `${env}-` : ''}${localDate(now)}`;

/** `household-[env-]YYYY-MM-DD.json`: `json` is `store.export()`. */
export function jsonExport(json: string, now?: Date, env?: string): ExportFile {
  return {
    filename: `${baseName(now, env)}.json`,
    text: json,
    mime: 'application/json',
  };
}

/** `household-YYYY-MM-DD.yaml`: the same document, written as YAML for people who prefer it. */
export function yamlExport(json: string, now?: Date, env?: string): ExportFile {
  return {
    filename: `${baseName(now, env)}.yaml`,
    text: stringify(JSON.parse(json) as unknown, { lineWidth: 0 }),
    mime: 'application/yaml',
  };
}

export interface ImportSummary {
  members: number;
  pets: number;
  locations: number;
  assets: number;
  items: number;
  reviews: number;
}

export type ImportPreview =
  | { ok: true; json: string; summary: ImportSummary; fileEnv: string }
  | { ok: false; error: string };

/**
 * Reads a file the person picked (JSON or YAML), brings it to the current schema and counts what
 * is in it. Nothing is written: the Data screen shows the counts and asks first.
 */
export function previewImport(text: string): ImportPreview {
  let raw: unknown;
  try {
    raw = text.trimStart().startsWith('{') ? JSON.parse(text) : parse(text);
  } catch (e) {
    return { ok: false, error: `That file is not valid JSON or YAML (${(e as Error).message}).` };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'That file does not look like a household export.' };
  }
  const loaded = bringForward(raw);
  if (loaded.kind === 'too-new') {
    return {
      ok: false,
      error: 'That export is from a newer version of the app. Update this device first.',
    };
  }
  if (loaded.kind === 'invalid') {
    return {
      ok: false,
      error: `That file is not a valid household export: ${loaded.error.message}`,
    };
  }
  const doc = loaded.doc;
  return {
    ok: true,
    json: JSON.stringify(doc),
    fileEnv: doc.meta.env,
    summary: {
      members: doc.household.members.length,
      pets: doc.household.pets.length,
      locations: Object.keys(doc.locations).length,
      assets: Object.keys(doc.assets).length,
      items: Object.keys(doc.items).length,
      reviews: Object.keys(doc.reviews).length,
    },
  };
}

/** Saves a text file through the browser's download. */
export function download(file: ExportFile): void {
  const url = URL.createObjectURL(new Blob([file.text], { type: file.mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
