import { defineConfig } from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({
  ...reference,
  testMatch: ['read-failure-closure.spec.ts'],
  timeout: 60_000,
});
