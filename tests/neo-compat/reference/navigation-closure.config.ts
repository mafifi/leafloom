import { defineConfig } from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({
  ...reference,
  testMatch: ['navigation-insertion.spec.ts', 'navigation-reorder.spec.ts'],
  timeout: 60_000,
});
