import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { evidenceMetadata } from './evidence';
export default defineConfig({metadata:evidenceMetadata(),testDir:'./tests',testMatch:'io-edge.spec.ts',workers:1,timeout:60_000,expect:{timeout:10_000},outputDir:'./io-edge-test-results',reporter:[['list'],['json',{outputFile:path.resolve(process.env.NEO_PARITY_IO_EDGE_REPORT??'parity/io-edge-results.json')}]],use:{trace:'retain-on-failure'}});
