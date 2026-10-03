import { defineConfig } from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({
  ...reference,
  testMatch: ['storage-text-refresh.spec.ts', 'storage-refresh-races.spec.ts'],
  timeout: 60000,
});
