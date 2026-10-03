import {evidenceMetadata} from './evidence';
import { defineConfig } from '@playwright/test';
export default defineConfig({metadata:evidenceMetadata(),testDir:'./tests',testMatch:'target.spec.ts',workers:1,timeout:60000,expect:{timeout:15000},outputDir:'./target-test-results',reporter:[['list'],['json',{outputFile:'target-results.json'}]],use:{trace:'retain-on-failure'}});
