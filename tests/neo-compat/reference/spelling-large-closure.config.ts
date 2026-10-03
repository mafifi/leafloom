import {defineConfig} from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({...reference,testMatch:['spelling-large-closure.spec.ts'],timeout:90_000});
