import {defineConfig} from '@playwright/test';
import base from './playwright.config';
import {referenceMetadata} from '../evidence.mjs';
process.env.LEAFLOOM_REFERENCE_VERSION='1.3.5';
export default defineConfig({...base,testMatch:'neo-1.3.5*.spec.ts',testIgnore:['neo-1.3.5-drafts.spec.ts'],metadata:await referenceMetadata(),expect:{timeout:3000}});
