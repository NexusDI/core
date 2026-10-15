import { defineConfig } from 'vitest/config';

// The browser suites: a React Router 8 app built and served, and a Vite dev
// server under HMR, both driven by Playwright. The unit config excludes them.
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/react-e2e',
  test: {
    name: '@nexusdi/react:e2e',
    watch: false,
    environment: 'node',
    include: ['src/**/*.e2e.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});
