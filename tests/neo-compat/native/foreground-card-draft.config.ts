import { defineConfig } from '@playwright/test';
import base from '../candidate/playwright.config';
if (process.env.LEAFLOOM_FOREGROUND_BROWSER !== '1') throw Error('Foreground browser duty requires explicit opt-in: LEAFLOOM_FOREGROUND_BROWSER=1');
export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'foreground-card-draft.spec.ts',
  testIgnore: [],
  metadata: { ...base.metadata, qualification: 'browser-foreground-only', nativeForegroundAcceptance: false },
  reporter: [['list']],
  use: { ...base.use, headless: false },
});
