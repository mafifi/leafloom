import { defineConfig } from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({
  ...reference,
  testMatch: ['storage-serialization-closure.spec.ts'],
  timeout: 60_000,
});
