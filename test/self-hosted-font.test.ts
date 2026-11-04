import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const read = (p: string) => readFileSync(root(p), 'utf8');

describe('the handwritten numeral font is self-hosted', () => {
  const css = read('src/styles.css');

  it('is a file in public/ with its licence beside it', () => {
    expect(statSync(root('public/fonts/caveat-latin-700-normal.woff2')).size).toBeGreaterThan(
      10_000,
    );
    expect(read('public/fonts/caveat-OFL.txt')).toMatch(/SIL Open Font License/);
  });

  it('is loaded from this origin only', () => {
    const faces = css.match(/@font-face\s*{[^}]*}/g) ?? [];
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      const urls = [...face.matchAll(/url\(\s*['"]?([^'")]+)/g)].map((m) => m[1]!);
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        expect(url, 'a font URL must be on this origin').toMatch(/^\/fonts\//);
        expect(existsSync(root(`public${url}`))).toBe(true);
      }
    }
  });

  it('is not fetched from any third-party host by the stylesheet or the page', () => {
    for (const text of [css, read('index.html')]) {
      expect(text).not.toMatch(/https?:\/\/[^'")\s]*(googleapis|gstatic|fonts\.|typekit|cdn)/i);
      expect(text).not.toMatch(/@import\s+url\(\s*['"]?https?:/i);
    }
  });

  it('is precached by the service worker', () => {
    expect(read('vite.config.ts')).toMatch(/globPatterns:[^\]]*woff2/);
  });
});
