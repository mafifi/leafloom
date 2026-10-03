import {defineConfig} from '@playwright/test';
import reference from './playwright.config';
export default defineConfig({...reference,testMatch:['library-pointer-closure.spec.ts','library-order.spec.ts','library-removal.spec.ts','shelf-auto-scroll.spec.ts','library-moves.spec.ts','covers.spec.ts'],grep:/\[NEO-(008|010|012|017|022|024)-/,timeout:60_000});
