import { defineConfig } from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({
  ...reference,
  testDir: '.',
  testMatch: ['backup-startup.spec.ts'],
  timeout: 60000,
});
