import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),plugins:[svelte({configFile:fileURLToPath(new URL('../svelte.config.js',import.meta.url))})],server:{host:'localhost',port:5182,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../..',import.meta.url))]}},build:{outDir:'../identity-dist',emptyOutDir:true},test:{include:['**/*.test.ts'],environment:'node'}});
