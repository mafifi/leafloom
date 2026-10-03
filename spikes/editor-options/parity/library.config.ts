import { evidenceMetadata } from './evidence';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
export default defineConfig({ metadata: evidenceMetadata(), testDir: './tests', testMatch: 'library.spec.ts', workers: 1,
  timeout: 45_000, expect: { timeout: 8_000 }, outputDir: './library-test-results',
  reporter: [['list'], ['json', { outputFile: path.resolve(process.env.NEO_PARITY_LIBRARY_REPORT ?? 'parity/library-results.json') }]],
  use: { trace: 'retain-on-failure' }, });
