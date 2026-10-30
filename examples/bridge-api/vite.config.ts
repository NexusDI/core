import { defineConfig } from 'vitest/config';

import { docExamples } from '@nexusdi/doc-examples';

export default defineConfig({
  root: import.meta.dirname,
  ...docExamples(),
  cacheDir: '../../node_modules/.vite/examples/bridge-api',
  test: {
    fsModuleCachePath:
      '../../node_modules/.vite/examples/bridge-api/fs-modules',
    name: '@nexusdi/bridge-api',
    watch: false,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The README's doctests run with the project's tests.
    includeSource: ['README.md'],
    // The workerd suite runs under vitest.workers.config.ts (test-workers),
    // and the Edge Runtime suite under vitest.edge.config.ts (test-edge).
    exclude: ['test/worker/**', 'test/edge/**'],
    benchmark: { include: ['bench/**/*.bench.ts'] },
    reporters: ['default'],
  },
});
