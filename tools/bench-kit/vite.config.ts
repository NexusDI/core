import { defineConfig } from 'vite';

// Test-only config: bench-kit is private and runs from source, so it has
// no build. Nx infers the `test` target from this file.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/tools/bench-kit',
  // Vite's tsconfig auto-discovery can walk out of a git worktree (see
  // libs/core/vite.config.ts), so the file is named explicitly.
  tsconfig: './tsconfig.json',
  test: {
    name: '@nexusdi/bench-kit',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
    // The sampler tests fork workers and the bootstrap tests resample
    // thousands of times; under a parallel nx run both outlast 5 s.
    testTimeout: 30_000,
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
