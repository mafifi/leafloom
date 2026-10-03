import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { evidenceMetadata } from './evidence';
export default defineConfig({ metadata:evidenceMetadata(), testDir:'./tests', testMatch:'acceptance-gap.spec.ts', workers:1, timeout:90_000, expect:{timeout:10_000}, outputDir:'./acceptance-gap-test-results', reporter:[['list'],['json',{outputFile:path.resolve(process.env.NEO_PARITY_ACCEPTANCE_GAP_REPORT??'parity/acceptance-gap-results.json')}]], use:{trace:'retain-on-failure'} });
