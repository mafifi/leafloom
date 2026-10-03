import { defineConfig } from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({
  ...reference,
  testMatch: ['spelling-closure.spec.ts'],
  timeout: 60000,
});
