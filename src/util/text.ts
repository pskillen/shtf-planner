/** Split text into paragraphs on blank lines. Release bodies are markdown; we show them as plain text. */
export function paragraphs(body: string): string[] {
  return body
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
