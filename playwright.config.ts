import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5199',
    channel: 'chrome',
    viewport: { width: 1200, height: 820 },
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: true,
  },
});
