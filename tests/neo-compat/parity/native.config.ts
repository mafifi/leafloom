import {defineConfig}from'@playwright/test';import{evidenceMetadata}from'./evidence';
const engine=process.env.NEO_NATIVE_ENGINE==='prosemirror'?'prosemirror':'original';
export default defineConfig({metadata:evidenceMetadata(),testDir:'./tests',testMatch:'native.spec.ts',workers:1,retries:0,timeout:40_000,expect:{timeout:6_000},outputDir:`./native-${engine}-artifacts`,reporter:[['list'],['json',{outputFile:`parity/native-${engine}-results.json`}]],use:{trace:'retain-on-failure'}});
