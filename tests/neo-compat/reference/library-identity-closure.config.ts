import {defineConfig} from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({...reference,testMatch:['library-identity-closure.spec.ts'],timeout:60_000});
