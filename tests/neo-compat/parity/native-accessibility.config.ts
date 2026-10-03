import {defineConfig} from '@playwright/test';import{evidenceMetadata}from'./evidence';
const engine=process.env.NEO_NATIVE_ACCESSIBILITY_ENGINE==='prosemirror'?'prosemirror':'original';
export default defineConfig({metadata:evidenceMetadata(),testDir:'./tests',testMatch:'native-accessibility.spec.ts',workers:1,retries:0,timeout:40_000,expect:{timeout:6_000},outputDir:`./native-accessibility-${engine}-artifacts`,reporter:[['list'],['json',{outputFile:`parity/native-accessibility-${engine}-results.json`}]],use:{trace:'retain-on-failure'}});
