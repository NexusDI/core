import { createRequire } from 'node:module';

import { defineConfig } from 'vite';

import { docExampleSources, docExamples } from '@nexusdi/doc-examples';

// nexusFixtures types its fixtures through @vitest/runner, which Vitest 5 no
// longer publishes, so its type test (src/fixtures.test-d.ts) runs on
// Vitest 4 alone, and tsconfig.spec.vitest5.json leaves it out. nexusTest's
// type tests run on both (spec 8.1).
const vitestMajor = (
  createRequire(import.meta.url)('vitest/package.json') as { version: string }
).version.split('.')[0];
const typecheckConfig =
  vitestMajor === '4' ? './tsconfig.spec.json' : './tsconfig.spec.vitest5.json';

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
      tsconfig: typecheckConfig,
      include: ['src/**/*.test-d.ts'],
      exclude: vitestMajor === '4' ? [] : ['src/fixtures.test-d.ts'],
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
