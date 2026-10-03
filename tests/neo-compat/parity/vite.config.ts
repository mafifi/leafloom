import { defineConfig } from 'vite';
import path from 'node:path';
export default defineConfig({build:{outDir:'parity-dist',emptyOutDir:false,lib:{entry:path.resolve('parity/src/legacy-boundary.ts'),name:'NeoProseMirror',formats:['iife'],fileName:()=> 'neo-prosemirror.js'},minify:false}});
