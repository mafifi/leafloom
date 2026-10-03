import { defineConfig } from '@playwright/test';import { resolve } from 'node:path';
export default defineConfig({testDir:'.',testMatch:'native.spec.ts',workers:1,timeout:45000,expect:{timeout:8000},outputDir:'../lifecycle-native-results',reporter:[['list'],['json',{outputFile:resolve('lifecycle-spike/native-results.json')}]],use:{trace:'retain-on-failure'}});
