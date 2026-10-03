import {defineConfig} from '@playwright/test';
import path from 'node:path';
import {evidenceMetadata} from './evidence';
export default defineConfig({metadata:evidenceMetadata(),testDir:'./tests',testMatch:'modifier-shortcuts.spec.ts',workers:1,retries:0,timeout:60_000,expect:{timeout:10_000},outputDir:'./modifier-shortcuts-test-results',reporter:[['list'],['json',{outputFile:process.env.NEO_MODIFIER_SHORTCUTS_REPORT||path.resolve('parity/modifier-shortcuts-results.json')}]],use:{trace:'retain-on-failure'}});
