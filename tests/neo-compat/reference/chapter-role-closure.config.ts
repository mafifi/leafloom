import { defineConfig } from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({
  ...reference,
  testMatch: ['chapter-role-closure.spec.ts'],
  timeout: 60000,
});
