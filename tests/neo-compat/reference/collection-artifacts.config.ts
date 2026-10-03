import {defineConfig} from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({...reference,testDir:'.',testMatch:['collection-artifacts.spec.ts'],timeout:60000});
