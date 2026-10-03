import {defineConfig} from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({...reference,testDir:'.',testMatch:'document-io.spec.ts',timeout:60000});
