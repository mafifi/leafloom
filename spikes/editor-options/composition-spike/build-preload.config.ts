import { defineConfig } from 'vite';import { fileURLToPath } from 'node:url';
export default defineConfig({build:{outDir:'composition-dist/host',emptyOutDir:false,ssr:fileURLToPath(new URL('./preload.cts',import.meta.url)),rollupOptions:{external:['electron'],output:{format:'cjs',entryFileNames:'preload.cjs'}},minify:false}});
