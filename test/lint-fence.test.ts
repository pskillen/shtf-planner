import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Proves the import fence in eslint.config.js (AGENTS.md, "Rules"). Each case lints a snippet as
 * if it lived at `file`.
 */
const eslint = new ESLint({ cwd: fileURLToPath(new URL('..', import.meta.url)) });

async function ruleIds(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: file });
  return result!.messages.map((m) => m.ruleId ?? m.message);
}

const fenced = (ids: string[]) => ids.includes('no-restricted-imports');

describe('the lint fence', () => {
  const bad: [string, string, string][] = [
    ['the engine imports React', 'src/engine/x.ts', "import React from 'react';\nReact;"],
    [
      'the engine imports a React subpath',
      'src/engine/x.ts',
      "import { jsx } from 'react/jsx-runtime';\njsx;",
    ],
    ['the engine imports the app', 'src/engine/x.ts', "import { App } from '../app/App';\nApp;"],
    [
      'the engine imports the store',
      'src/engine/x.ts',
      "import { open } from '../store/db';\nopen;",
    ],
    ['the engine imports idb', 'src/engine/x.ts', "import { openDB } from 'idb';\nopenDB;"],
    [
      'the engine imports Drive',
      'src/engine/sub/x.ts',
      "import { sync } from '../../store/drive/sync';\nsync;",
    ],
    [
      'the engine imports a Google module',
      'src/engine/x.ts',
      "import { gapi } from './google-auth';\ngapi;",
    ],
    ['the model imports React', 'src/model/x.ts', "import React from 'react';\nReact;"],
    ['the model imports the engine', 'src/model/x.ts', "import { f } from '../engine/f';\nf;"],
    ['the model imports the util', 'src/model/x.ts', "import { f } from '../util/f';\nf;"],
    ['the model imports a package', 'src/model/x.ts', "import { openDB } from 'idb';\nopenDB;"],
    ['the store imports the app', 'src/store/x.ts', "import { App } from '../app/App';\nApp;"],
    ['the store imports React', 'src/store/x.ts', "import { useState } from 'react';\nuseState;"],
    [
      'a .tsx in the engine imports the app',
      'src/engine/x.tsx',
      "import { App } from '../app/App';\nApp;",
    ],
    [
      'a .tsx in the model imports the engine',
      'src/model/x.tsx',
      "import { f } from '../engine/f';\nf;",
    ],
    [
      'a .tsx in the store imports the app',
      'src/store/x.tsx',
      "import { App } from '../app/App';\nApp;",
    ],
  ];
  for (const [name, file, code] of bad) {
    it(`fails when ${name}`, async () => {
      expect(fenced(await ruleIds(file, code))).toBe(true);
    });
  }

  const good: [string, string, string][] = [
    [
      'the engine imports the model, the util and itself',
      'src/engine/x.ts',
      "import { Doc } from '../model/doc';\nimport { f } from '../util/f';\nimport { g } from './g';\nDoc;\nf;\ng;",
    ],
    [
      'the model imports zod and itself',
      'src/model/x.ts',
      "import { z } from 'zod';\nimport { a } from './a';\nz;\na;",
    ],
    [
      'the store imports the model, the engine and idb',
      'src/store/x.ts',
      "import { openDB } from 'idb';\nimport { Doc } from '../model/doc';\nimport { score } from '../engine/score';\nopenDB;\nDoc;\nscore;",
    ],
    [
      'the app imports everything',
      'src/app/x.tsx',
      "import { useState } from 'react';\nimport { score } from '../engine/score';\nimport { open } from '../store/db';\nuseState;\nscore;\nopen;",
    ],
  ];
  for (const [name, file, code] of good) {
    it(`passes when ${name}`, async () => {
      expect(fenced(await ruleIds(file, code))).toBe(false);
    });
  }
});
