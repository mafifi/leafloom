import { defineConfig } from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({
  ...reference,
  testMatch: ['save-failure-source.spec.ts'],
  timeout: 60_000,
});
