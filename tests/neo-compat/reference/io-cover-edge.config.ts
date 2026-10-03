import {defineConfig} from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({...reference,testDir:'.',testMatch:'io-cover-edge.spec.ts',timeout:60000});
