import {evidenceMetadata} from './evidence';
import { defineConfig } from '@playwright/test';
const engine=process.env.NEO_EDITING_ENGINE==='prosemirror'?'prosemirror':'original';
export default defineConfig({metadata:evidenceMetadata(),testDir:'./tests',testMatch:'editing.spec.ts',workers:1,retries:0,timeout:40_000,expect:{timeout:6_000},outputDir:`./editing-${engine}-artifacts`,reporter:[['list'],['json',{outputFile:`parity/editing-${engine}-results.json`}]],use:{trace:'retain-on-failure'}});
