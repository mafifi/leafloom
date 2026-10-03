import { defineConfig } from '@playwright/test';
import reference from './playwright.config';

/** Bounded shared source proof. Coherent registry refresh belongs to the root. */
export default defineConfig({
  ...reference,
  testMatch: [
    'editor-closure-history.spec.ts',
    'editor-closure-headings.spec.ts',
    'editor-closure-vim.spec.ts',
  ],
});
