import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  plugins: [svelte()],
  server: { port: 5199, strictPort: true },
  preview: { port: 5199, strictPort: true },
  worker: { format: 'es' },
  // Svelte's server build treats runes as plain values, which would hide
  // reactivity bugs in the game controller from its tests.
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // The solver tests are pure CPU work that takes seconds on a laptop and
    // several times longer on a shared CI runner, past the default limit.
    testTimeout: 30_000,
  },
});
