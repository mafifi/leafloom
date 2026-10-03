import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: 'electron.spec.ts', outputDir: '../test-results-electron', timeout: 60000, workers: 1, reporter: 'list', use: { trace: 'retain-on-failure' } });
