import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// ---- The import fence (AGENTS.md, "Rules") ----
// test/lint-fence.test.ts proves each of these fails on a bad import.
const UI = [
  { name: 'react', message: 'this layer must not import React' },
  { name: 'react-dom', message: 'this layer must not import React' },
  { name: 'react-router-dom', message: 'this layer must not import React' },
];
const UI_SUBPATHS = {
  group: ['react/*', 'react-dom/*', 'react-router-dom/*'],
  message: 'this layer must not import React',
};
// `from '../app/x'`, `from '../../store/y'` ... any relative hop into a named top-level directory.
const reach = (dirs, message) => ({
  regex: `^(\\.\\./)+(${dirs.join('|')})(/|$)`,
  message,
});
// Absolute-ish aliases are not used; relative paths are the only way into another layer.

export default tseslint.config(
  { ignores: ['dist', 'tmp', 'test-results', 'playwright-report', '.claude/**', 'src/generated'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // The model is types and Zod schemas only: it imports zod and itself, nothing else.
    files: ['src/model/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: UI,
          patterns: [
            UI_SUBPATHS,
            reach(
              ['app', 'engine', 'packs', 'store', 'util'],
              'src/model imports only zod and src/model',
            ),
            { regex: '^(?!\\.{1,2}/|zod$)[^.]', message: 'src/model imports only zod and itself' },
          ],
        },
      ],
    },
  },
  {
    // The engine is pure functions over the document and the packs: no React, no IndexedDB, no
    // Drive or Google, no store, no app.
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...UI,
            { name: 'idb', message: 'the engine never touches IndexedDB' },
            { name: 'fake-indexeddb', message: 'the engine never touches IndexedDB' },
          ],
          patterns: [
            UI_SUBPATHS,
            reach(
              ['app', 'store', 'packs'],
              'src/engine imports only src/model, src/util and src/engine',
            ),
            {
              regex: '(^|/)(drive|google|gapi|gsi)([-_./]|$)|googleapis|google-auth',
              message: 'the engine never touches Drive or Google',
            },
          ],
        },
      ],
    },
  },
  {
    // The store never reaches the UI.
    files: ['src/store/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: UI,
          patterns: [UI_SUBPATHS, reach(['app'], 'src/store never imports src/app')],
        },
      ],
    },
  },
  // src/app may import everything.
);
