import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    fsModuleCachePath:
      '../../node_modules/.vite/examples/bridge-api-e2e/fs-modules',
    name: '@nexusdi/bridge-api:e2e',
    include: ['e2e/**/*.e2e.ts'],
    // The e2e-growth target runs these (vitest.e2e-growth.config.ts).
    exclude: [...configDefaults.exclude, 'e2e/growth/**'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
