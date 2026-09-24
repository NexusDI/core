import { defineConfig } from 'vite';

import { docExampleSources, docExamples } from '@nexusdi/doc-examples';

import { standardDecorators } from './vite.decorators.ts';

// docExamples() returns its own `plugins` array (the doctest wiring), which
// a plain object spread would silently replace rather than merge with
// standardDecorators() below. Pulled apart here so both plugin sets run.
const { plugins: docExamplePlugins, ...docExampleConfig } = docExamples();

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/core',
  // Vite's own tsconfig auto-discovery walks parent directories looking for
  // the nearest tsconfig.json, with no boundary at the workspace root. In a
  // git worktree that walk can escape the worktree entirely; naming the file
  // explicitly keeps it on this project's own.
  tsconfig: './tsconfig.spec.json',
  ...docExampleConfig,
  plugins: [standardDecorators(), ...docExamplePlugins],
  build: {
    sourcemap: false,
  },
  test: {
    name: '@nexusdi/core',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'vite.decorators.test.ts'],
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
