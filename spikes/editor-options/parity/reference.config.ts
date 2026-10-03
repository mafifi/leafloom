import {evidenceMetadata} from './evidence';
import { defineConfig } from '@playwright/test';
export default defineConfig({metadata:evidenceMetadata(), testDir: './tests', testMatch: 'reference.spec.ts', workers: 1,
  reporter: [['list'], ['json', { outputFile: 'reference-results.json' }]], timeout: 60_000, expect: { timeout: 15_000 }, outputDir: './reference-test-results',
  use: { trace: 'retain-on-failure' }, });
