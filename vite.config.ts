import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// The browser tests reuse a dev server already on the port, which may belong
// to another worktree. This lets them check which checkout it is serving.
function checkoutStamp(): Plugin {
  return {
    name: 'checkout-stamp',
    configureServer(server) {
      server.middlewares.use('/__checkout', (_req, res) => res.end(server.config.root));
    },
  };
}

// Writes the service worker after the build, so its precache list covers
// every emitted file (public icons and the solver worker included) and its
// version changes whenever any of them does.
function serviceWorker(): Plugin {
  let outDir = '';
  return {
    name: 'service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = readdirSync(outDir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => relative(outDir, join(entry.parentPath, entry.name)).split(sep).join('/'))
        .filter((path) => path !== 'sw.js')
        .sort();
      const hash = createHash('sha256');
      for (const path of files) hash.update(path).update(readFileSync(join(outDir, path)));
      const version = hash.digest('hex').slice(0, 12);
      const body = readFileSync(resolve(import.meta.dirname, 'src/service-worker.js'), 'utf8');
      const header = `const VERSION = ${JSON.stringify(version)};\nconst FILES = ${JSON.stringify(['./', ...files])};\n`;
      writeFileSync(join(outDir, 'sw.js'), header + body);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [svelte(), checkoutStamp(), serviceWorker()],
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
