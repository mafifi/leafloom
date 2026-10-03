import { evidenceMetadata } from './evidence';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
export default defineConfig({ metadata: evidenceMetadata(),testDir:'./tests',testMatch:'books.spec.ts',workers:1,timeout:60_000,expect:{timeout:8_000},outputDir:'./books-test-results',reporter:[['list'],['json',{outputFile:path.resolve(process.env.NEO_PARITY_BOOKS_REPORT ?? 'parity/books-results.json')}]],use:{trace:'retain-on-failure'}});
