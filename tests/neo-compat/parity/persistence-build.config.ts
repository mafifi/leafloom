import {defineConfig} from 'vite';import path from 'node:path';
export default defineConfig({build:{outDir:'parity-dist',emptyOutDir:false,ssr:path.resolve('parity/src/persistence-boundary.ts'),rollupOptions:{output:{format:'cjs',entryFileNames:'persistence-boundary.cjs'}},minify:false}});
