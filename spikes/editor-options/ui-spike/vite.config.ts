import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { bookHost } from './host.ts';
import { fileURLToPath } from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),plugins:[svelte({configFile:fileURLToPath(new URL('../svelte.config.js',import.meta.url))}),bookHost()],server:{host:'localhost',port:5180,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../..',import.meta.url))]}},build:{outDir:'../ui-dist',emptyOutDir:true},test:{include:['**/*.test.ts'],environment:'node'}});
