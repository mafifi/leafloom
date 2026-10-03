import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: 'browser.spec.ts', outputDir: './browser-test-results', timeout: 30_000,
  expect: { timeout: 5_000 }, fullyParallel: false, workers: 1,
  use: { baseURL: 'http://localhost:5178', viewport: { width: 1440, height: 1000 }, headless: true, trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://localhost:5178', reuseExistingServer: true, timeout: 30_000 },
});
