import { evidenceMetadata } from './evidence';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
export default defineConfig({ metadata:evidenceMetadata(), testDir: './tests', testMatch: 'spelling.spec.ts', workers: 1, timeout: 60_000, expect: { timeout: 15_000 }, outputDir: './spelling-test-results', reporter: [['list'], ['json', { outputFile: process.env.NEO_SPELLING_REPORT || process.env.NEO_SPELL_REPORT || path.resolve('parity/spelling-results.json') }]], use: { trace: 'retain-on-failure' } });
