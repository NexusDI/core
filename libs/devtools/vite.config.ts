import { defineConfig } from 'vite';

import { docExampleSources, docExamples } from '@nexusdi/doc-examples';

// regressions/r04-injectable-lifetime.test.ts applies @nexusdi/decorators'
// @Injectable and @Module, so these tests lower decorators the way the
// decorators package's own tests do. vite.decorators.ts is build tooling that
// package does not publish, which leaves a relative path as the only way to
// reach it.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { standardDecorators } from '../decorators/vite.decorators.ts';

// docExamples() returns its own `plugins` array, which a plain object spread
// would replace. Pulled apart so both plugin sets run.
const { plugins: docExamplePlugins, ...docExampleConfig } = docExamples();

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/devtools',
  tsconfig: './tsconfig.spec.json',
  ...docExampleConfig,
  plugins: [standardDecorators(), ...docExamplePlugins],
  build: { sourcemap: false },
  test: {
    name: '@nexusdi/devtools',
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
