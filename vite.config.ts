/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolveBuildEnv } from './src/util/build-env';

/**
 * The name of the date reader's runtime cache. The model files are not hashed by Vite, so the name
 * carries a hash of the runtime version and the three files: new files, new cache (the old one is
 * deleted at start-up, src/scan/ocr/cache.ts).
 */
function dateReaderCacheName(): string {
  const hash = createHash('sha256');
  const ort = JSON.parse(readFileSync('node_modules/onnxruntime-web/package.json', 'utf8')) as {
    version: string;
  };
  hash.update(ort.version);
  for (const f of ['det-fp16.onnx', 'rec-fp16.onnx', 'dict.txt']) {
    hash.update(readFileSync(`public/ocr/paddle/${f}`));
  }
  return `date-reader-${hash.digest('hex').slice(0, 8)}`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const buildEnv = resolveBuildEnv(env.BUILD_ENV || process.env.BUILD_ENV);
  const buildVersion = (env.BUILD_VERSION || process.env.BUILD_VERSION || 'local').replace(
    /^v/,
    '',
  );

  const dateReaderCache = dateReaderCacheName();

  return {
    base: '/',
    build: { target: 'es2022' },
    // The date reader runs in a module worker (src/scan/ocr/ocr.worker.ts).
    worker: { format: 'es' },
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'SHTF Planner',
          short_name: 'Planner',
          description: 'A household emergency preparedness planner that works offline.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#f4f1ea',
          theme_color: '#2f5d50',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Precache the built app; the PWA serves index.html for every path (client routing).
          // The date reader's files (the ORT wasm, 21 MB, the two models and their character list)
          // are not precached: they are fetched on first use and kept by the runtime route below.
          globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,webmanifest,woff2}'],
          navigateFallback: '/index.html',
          // Claim open pages when the worker first installs, so a first visit is controlled (and
          // its date reader fetches are kept) without a reload. An update still waits for the tap:
          // skipWaiting is not set.
          clientsClaim: true,
          runtimeCaching: [
            {
              // Unanchored on purpose: Workbox matches a RegExp against a cross-origin URL only
              // from its start, so this route is same-origin only (nothing third-party is kept).
              urlPattern: /\/(assets\/ort-wasm[^/]*\.wasm|ocr\/paddle\/[^/]+)$/,
              handler: 'CacheFirst',
              options: { cacheName: dateReaderCache, cacheableResponse: { statuses: [200] } },
            },
          ],
        },
      }),
    ],
    define: {
      __BUILD_ENV__: JSON.stringify(buildEnv),
      __BUILD_VERSION__: JSON.stringify(buildVersion),
      __DATE_READER_CACHE__: JSON.stringify(dateReaderCache),
    },
    test: {
      environment: 'node',
      globals: true,
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts', 'test/**/*.test.tsx'],
      exclude: ['**/node_modules/**', 'e2e/**', 'tmp/**', 'dist/**', '.claude/**'],
      reporters: process.env.GITHUB_ACTIONS
        ? ['default', ['junit', { outputFile: 'test-results/junit.xml' }]]
        : ['default'],
    },
  };
});
