import { defineConfig } from 'vitest/config';

import { docExamples } from '@nexusdi/doc-examples';

// Only the README runs. The fixtures under src/ are bundled by the size
// report and never executed.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/examples/size',
  ...docExamples(),
  test: {
    fsModuleCachePath: '../../node_modules/.vite/examples/size/fs-modules',
    name: '@nexusdi/size',
    watch: false,
    environment: 'node',
    include: [],
    includeSource: ['README.md'],
    reporters: ['default'],
  },
}));
