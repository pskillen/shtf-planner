/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolveBuildEnv } from './src/util/build-env';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const buildEnv = resolveBuildEnv(env.BUILD_ENV || process.env.BUILD_ENV);
  const buildVersion = (env.BUILD_VERSION || process.env.BUILD_VERSION || 'local').replace(
    /^v/,
    '',
  );

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
          // That includes the date reader: its runtime wasm (21 MB), the two models and their
          // character list, so a camera date reads with no network after install.
          globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,webmanifest,woff2,wasm,onnx,txt}'],
          // Workbox skips files over 2 MiB by default; the wasm is 20.7 MiB. Cloudflare Pages
          // refuses files over 25 MiB, so this stays under that.
          maximumFileSizeToCacheInBytes: 24 * 1024 * 1024,
          globIgnores: ['ocr/LICENSE-Apache-2.0.txt'],
          navigateFallback: '/index.html',
        },
      }),
    ],
    define: {
      __BUILD_ENV__: JSON.stringify(buildEnv),
      __BUILD_VERSION__: JSON.stringify(buildVersion),
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
