import { defineConfig } from 'vitest/config';

import { docExamples } from '@nexusdi/doc-examples';

export default defineConfig(() => ({
  root: import.meta.dirname,
  ...docExamples(),
  cacheDir: '../../node_modules/.vite/examples/meridian-systems',
  test: {
    fsModuleCachePath:
      '../../node_modules/.vite/examples/meridian-systems/fs-modules',
    name: '@nexusdi/meridian-systems',
    watch: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // The README's doctests run with the project's tests.
    includeSource: ['README.md'],
    // An hour of ticks runs past vitest's 5 s default on a loaded machine.
    testTimeout: 30_000,
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
