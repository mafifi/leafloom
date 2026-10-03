import { evidenceMetadata } from './evidence';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
export default defineConfig({ metadata: evidenceMetadata(),testDir:'./tests',testMatch:'persistence.spec.ts',workers:1,timeout:60_000,expect:{timeout:10_000},outputDir:'./persistence-test-results',reporter:[['list'],['json',{outputFile:path.resolve(process.env.NEO_PARITY_PERSISTENCE_REPORT ?? 'parity/persistence-results.json')}]],use:{trace:'retain-on-failure'}});
