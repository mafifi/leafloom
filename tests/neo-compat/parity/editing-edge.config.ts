import {evidenceMetadata} from './evidence';
import {defineConfig} from '@playwright/test';
const engine=process.env.NEO_EDITING_EDGE_ENGINE==='prosemirror'?'prosemirror':'original';
export default defineConfig({metadata:evidenceMetadata(),testDir:'./tests',testMatch:'editing-edge.spec.ts',workers:1,retries:0,timeout:40_000,expect:{timeout:6_000},outputDir:`./editing-edge-${engine}-artifacts`,reporter:[['list'],['json',{outputFile:`parity/editing-edge-${engine}-results.json`}]],use:{trace:'retain-on-failure'}});
