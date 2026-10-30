import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

import { docExamples } from '@nexusdi/doc-examples';

const doctests = docExamples();

export default defineConfig(() => ({
  root: import.meta.dirname,
  resolve: doctests.resolve,
  ssr: doctests.ssr,
  cacheDir: '../../node_modules/.vite/examples/federation-cartography',
  plugins: [...doctests.plugins, react()],
  test: {
    name: '@nexusdi/federation-cartography',
    watch: false,
    globals: true,
    environment: 'jsdom',
    // The README's doctests run with the project's tests.
    includeSource: ['README.md'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
