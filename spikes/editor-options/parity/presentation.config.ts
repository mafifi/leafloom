import { evidenceMetadata } from './evidence';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
export default defineConfig({ metadata:evidenceMetadata(), testDir:'./tests', testMatch:'presentation.spec.ts', workers:1, timeout:60_000, expect:{timeout:15_000}, outputDir:'./presentation-test-results', reporter:[['list'],['json',{outputFile:process.env.NEO_PRESENTATION_REPORT||path.resolve('parity/presentation-results.json')}]], use:{trace:'retain-on-failure'} });
