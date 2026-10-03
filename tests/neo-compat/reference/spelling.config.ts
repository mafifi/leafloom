import {defineConfig} from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({...reference,testDir:'.',testMatch:'spelling.spec.ts'});
