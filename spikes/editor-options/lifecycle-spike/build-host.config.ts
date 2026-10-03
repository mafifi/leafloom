import { defineConfig } from 'vite';import { fileURLToPath } from 'node:url';
export default defineConfig({build:{outDir:'lifecycle-dist/host',emptyOutDir:true,ssr:fileURLToPath(new URL('./main.ts',import.meta.url)),rollupOptions:{external:['electron','jsdom'],output:{format:'es',entryFileNames:'main.js'}},minify:false}});
