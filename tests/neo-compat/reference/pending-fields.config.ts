import { defineConfig } from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({
  ...reference,
  testMatch: ['pending-fields-close.spec.ts'],
  timeout: 60_000,
});
