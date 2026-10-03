import {evidenceMetadata} from './evidence';
import path from 'node:path';
import {defineConfig} from '@playwright/test';
export default defineConfig({metadata:evidenceMetadata(),testDir:'./tests',testMatch:'modal-families.spec.ts',workers:1,retries:0,timeout:60_000,expect:{timeout:8_000},outputDir:'./modal-families-test-results',reporter:[['list'],['json',{outputFile:process.env.NEO_MODAL_FAMILIES_REPORT||path.resolve('parity/modal-families-results.json')}]],use:{trace:'retain-on-failure'}});
