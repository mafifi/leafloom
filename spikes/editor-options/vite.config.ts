import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({ plugins: [svelte()], base: './', server: { fs: { allow: ['../..'] } }, test: { include: ['src/**/*.test.ts', 'parity/tests/codec.spec.ts'], environment: 'node' } });
