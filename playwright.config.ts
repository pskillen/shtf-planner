import { defineConfig } from '@playwright/test';

// Locally we use the system Chrome; CI installs Playwright's Chromium.
const useSystemChrome = !process.env.CI;
// Locally a server already on the port is reused, so parallel worktrees each pick their own
// port with E2E_PORT, or they test each other's builds.
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 120_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
    ...(useSystemChrome ? { channel: 'chrome' } : {}),
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
