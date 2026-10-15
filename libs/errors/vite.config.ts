import { defineConfig } from 'vite';

import { docExampleSources, docExamples } from '@nexusdi/doc-examples';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/errors',
  tsconfig: './tsconfig.spec.json',
  ...docExamples(),
  build: { sourcemap: false },
  test: {
    name: '@nexusdi/errors',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    includeSource: docExampleSources(),
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.spec.json',
      include: ['src/**/*.test-d.ts'],
    },
    reporters: [
      'default',
      // doc-behaviour-run.test.ts holds every sentence a reference entry
      // renders against this report. It sits inside the test target's cached
      // output.
      ['json', { outputFile: './test-output/vitest/coverage/report.json' }],
    ],
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
