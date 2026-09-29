import { defineConfig } from 'vite';

import { docExampleSources, docExamples } from '@nexusdi/doc-examples';

import { standardDecorators } from './vite.decorators.ts';

// docExamples() returns its own `plugins` array, which a plain object spread
// would replace. Pulled apart so both plugin sets run.
const { plugins: docExamplePlugins, ...docExampleConfig } = docExamples();

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/decorators',
  tsconfig: './tsconfig.spec.json',
  ...docExampleConfig,
  plugins: [standardDecorators(), ...docExamplePlugins],
  build: { sourcemap: false },
  test: {
    name: '@nexusdi/decorators',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'vite.decorators.test.ts'],
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
