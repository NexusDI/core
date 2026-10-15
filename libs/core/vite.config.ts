import { defineConfig } from 'vite';

import { docExampleSources, docExamples } from '@nexusdi/doc-examples';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/core',
  // Vite's own tsconfig auto-discovery walks parent directories looking for
  // the nearest tsconfig.json, with no boundary at the workspace root. In a
  // git worktree that walk can escape the worktree entirely; naming the file
  // explicitly keeps it on this project's own.
  tsconfig: './tsconfig.spec.json',
  ...docExamples(),
  build: {
    sourcemap: false,
  },
  test: {
    name: '@nexusdi/core',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['src/**/*.browser.test.ts'],
    includeSource: docExampleSources(),
    // R08 asserts that a root-level transient is collectable, which needs
    // globalThis.gc.
    execArgv: ['--expose-gc'],
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
