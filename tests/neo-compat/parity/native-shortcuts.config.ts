import {defineConfig} from '@playwright/test';
import path from 'node:path';
import {evidenceMetadata} from './evidence';
export default defineConfig({metadata:{...evidenceMetadata(),nativeOsDriver:process.env.NEO_NATIVE_OS_DRIVER==='1'?'root-coordinated-cua-native-app':'disabled'},testDir:'./tests',testMatch:'native-shortcuts.spec.ts',workers:1,timeout:900_000,expect:{timeout:15_000},outputDir:'./native-shortcuts-test-results',reporter:[['list'],['json',{outputFile:process.env.NEO_NATIVE_OS_REPORT??path.resolve('parity/native-shortcuts-results.json')}]],use:{trace:'retain-on-failure'}});
