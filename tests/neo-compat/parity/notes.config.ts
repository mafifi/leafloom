import {evidenceMetadata} from './evidence';
import {defineConfig} from '@playwright/test';
const engine=process.env.NEO_NOTES_ENGINE==='prosemirror'?'prosemirror':'original';
export default defineConfig({metadata:evidenceMetadata(),testDir:'./tests',testMatch:'notes.spec.ts',workers:1,retries:0,timeout:40_000,expect:{timeout:6_000},outputDir:`./notes-${engine}-artifacts`,reporter:[['list'],['json',{outputFile:`parity/notes-${engine}-results.json`}]],use:{trace:'retain-on-failure'}});
