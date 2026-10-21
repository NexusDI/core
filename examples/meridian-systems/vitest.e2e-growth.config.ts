import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    fsModuleCachePath:
      '../../node_modules/.vite/examples/meridian-systems-e2e-growth/fs-modules',
    name: '@nexusdi/meridian-systems:e2e-growth',
    include: ['e2e/**/*.e2e.ts'],
    globalSetup: ['e2e/node-pin.ts'],
    environment: 'node',
  },
});
