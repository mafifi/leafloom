import { defineConfig } from '@playwright/test';
import reference from './playwright.config';

/** All source journeys safe to execute without acquiring the user's window or clipboard. */
export default defineConfig({
  ...reference,
  testDir: '..',
  testMatch: [
    ...(reference.testMatch as string[]).map((file) => `**/candidate/${file}`),
    '**/candidate/navigation-insertion.spec.ts',
    '**/candidate/navigation-reorder.spec.ts',
    '**/candidate/editor-closure-history.spec.ts',
    '**/candidate/editor-closure-headings.spec.ts',
    '**/candidate/editor-closure-vim.spec.ts',
    '**/candidate/pending-fields-close.spec.ts',
    '**/candidate/save-failure-source.spec.ts',
    '**/candidate/darling-outline-closure.spec.ts',
    '**/candidate/onboarding-font-preview.spec.ts',
    '**/candidate/spelling-interface-default.spec.ts',
    '**/candidate/storage-serialization-closure.spec.ts',
    '**/candidate/read-failure-closure.spec.ts',
    '**/candidate/history-goals-markdown-closure.spec.ts',
    '**/candidate/library-pointer-closure.spec.ts',
    '**/candidate/spelling-closure.spec.ts',
    '**/candidate/storage-text-refresh.spec.ts',
    '**/candidate/storage-refresh-races.spec.ts',
    '**/candidate/chapter-role-closure.spec.ts',
    '**/reference/document-io.spec.ts',
    '**/reference/io-cover-edge.spec.ts',
    '**/reference/pdf-layout.spec.ts',
  ],
  timeout: 60_000,
});
