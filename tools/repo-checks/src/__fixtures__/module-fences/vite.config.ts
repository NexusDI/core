import { defineConfig } from 'vite';

import { docExamples } from '@nexusdi/doc-examples';

export default defineConfig(() => ({
  root: import.meta.dirname,
  ...docExamples(),
  test: {
    include: [],
    includeSource: ['*.md'],
    watch: false,
    fsModuleCachePath:
      '../../../../../node_modules/.vite/tools/repo-checks-module-fences/fs-modules',
  },
}));
