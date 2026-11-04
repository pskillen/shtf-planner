import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'generated' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('production source', () => {
  it('imports nothing from test/ (shared fixtures live in src/fixtures)', () => {
    const bad = sources(join(root, 'src')).filter((file) =>
      /from\s+['"](?:\.\.\/)+test\/|import\(\s*['"](?:\.\.\/)+test\//.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(bad).toEqual([]);
  });
});
