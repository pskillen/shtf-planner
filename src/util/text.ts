/** Orders strings by code unit with plain `<`, so a sort never depends on the host locale. */
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Split text into paragraphs on blank lines. Release bodies are markdown; we show them as plain text. */
export function paragraphs(body: string): string[] {
  return body
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
