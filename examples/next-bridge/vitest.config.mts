import { defineConfig } from 'vitest/config';

import { docExamples } from '@nexusdi/doc-examples';

// Only the README runs. The routes are exercised by the e2e config.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/examples/next-bridge',
  ...docExamples(),
  test: {
    fsModuleCachePath:
      '../../node_modules/.vite/examples/next-bridge/fs-modules',
    name: '@nexusdi/next-bridge',
    watch: false,
    environment: 'node',
    include: [],
    includeSource: ['README.md'],
    reporters: ['default'],
  },
}));
