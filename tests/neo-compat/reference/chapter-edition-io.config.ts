import { defineConfig } from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({
  ...reference,
  testDir: '.',
  testMatch: ['chapter-edition-io.spec.ts'],
  timeout: 90000,
});
