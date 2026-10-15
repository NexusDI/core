import { defineConfig } from 'vite';

import { docExampleSources, docExamples } from '@nexusdi/doc-examples';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/vitest',
  tsconfig: './tsconfig.spec.json',
  ...docExamples(),
  build: { sourcemap: false },
  test: {
    name: '@nexusdi/vitest',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['src/__fixtures__/**'],
    includeSource: docExampleSources(),
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.spec.json',
      include: ['src/**/*.test-d.ts'],
    },
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      exclude: [
        '**/index.ts',
        'dist/**/*',
        'vite.config.ts',
        'eslint.config.mjs',
      ],
    },
  },
}));
