import { defineConfig } from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({
  ...reference,
  testMatch: ['onboarding-font-preview.spec.ts', 'spelling-interface-default.spec.ts'],
});
