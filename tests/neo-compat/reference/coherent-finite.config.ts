import { defineConfig } from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({ ...reference, testDir: '..', testMatch: [
 '**/reference/document-io.spec.ts', '**/reference/io-cover-edge.spec.ts', '**/reference/pdf-layout.spec.ts',
 '**/candidate/chapter-heading-enter.spec.ts', '**/candidate/tab-spacing.spec.ts', '**/candidate/writing-recovery-guards.spec.ts', '**/candidate/vim-cross-chapter.spec.ts', '**/candidate/book-folder-replacement.spec.ts', '**/candidate/resume-mixed-blocks.spec.ts', '**/candidate/shelf-auto-scroll.spec.ts', '**/candidate/background-save.spec.ts', '**/candidate/remote-position.spec.ts', '**/candidate/runtime-errors.spec.ts', '**/candidate/library-external-refresh.spec.ts', '**/candidate/collection-output.spec.ts', '**/candidate/vim-graphemes.spec.ts', '**/candidate/external-change.spec.ts', '**/candidate/resume-position.spec.ts', '**/candidate/undo-routing.spec.ts', '**/candidate/title-enter.spec.ts',
], timeout: 60000 });
