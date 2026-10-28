import { defineConfig } from 'vitest/config';

// The growth cases. Only the
// non-required demo-growth CI job runs this target. After a green RC cycle, a
// case joins the gating e2e target with a git mv out of e2e/growth/.
export default defineConfig({
  root: import.meta.dirname,
  test: {
    fsModuleCachePath:
      '../../node_modules/.vite/examples/bridge-api-e2e-growth/fs-modules',
    name: '@nexusdi/bridge-api:e2e-growth',
    include: ['e2e/growth/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
