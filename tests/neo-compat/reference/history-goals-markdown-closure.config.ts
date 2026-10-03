import {defineConfig} from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({...reference,testMatch:['history-goals-markdown-closure.spec.ts'],timeout:60_000});
