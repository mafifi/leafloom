import { evidenceMetadata } from './evidence';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
export default defineConfig({metadata:evidenceMetadata(),testDir:'./tests',testMatch:'adapter-regressions.spec.ts',workers:1,retries:0,timeout:45_000,expect:{timeout:8_000},outputDir:'./adapter-regressions-test-results',reporter:[['list'],['json',{outputFile:process.env.NEO_ADAPTER_REGRESSIONS_REPORT||path.resolve('parity/adapter-regressions-results.json')}]],use:{trace:'retain-on-failure'}});
