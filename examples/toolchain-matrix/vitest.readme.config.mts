import { defineConfig } from 'vitest/config';

import { docExamples } from '@nexusdi/doc-examples';

// Only the README runs. The scripts have their own node:test suite.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/examples/toolchain-matrix',
  ...docExamples(),
  test: {
    fsModuleCachePath:
      '../../node_modules/.vite/examples/toolchain-matrix/fs-modules',
    name: '@nexusdi/toolchain-matrix',
    watch: false,
    environment: 'node',
    include: [],
    includeSource: ['README.md'],
    reporters: ['default'],
  },
}));
