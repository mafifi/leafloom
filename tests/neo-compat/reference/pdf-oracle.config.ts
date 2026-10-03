import {defineConfig} from '@playwright/test';
import config from './playwright.config';
export default defineConfig({...config,testDir:'.',testMatch:'pdf-oracle.spec.ts',timeout:60000,reporter:[['list'],['json',{outputFile:process.env.LEAFLOOM_REFERENCE_REPORT??'/tmp/leafloom-original-hidden-pdf-oracle.json'}]]});
