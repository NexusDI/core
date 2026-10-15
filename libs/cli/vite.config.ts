import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/cli',
  tsconfig: './tsconfig.spec.json',
  build: { sourcemap: false },
  test: {
    name: '@nexusdi/cli',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // Process tests spawn the built bin, one Node per case.
    testTimeout: 60_000,
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      exclude: ['dist/**/*', 'vite.config.ts', 'eslint.config.mjs'],
    },
  },
}));
