import { defineConfig } from 'vite';

import { docExampleSources, docExamples } from '@nexusdi/doc-examples';

export default defineConfig(() => ({
  ...docExamples(),
  test: { includeSource: docExampleSources() },
}));
