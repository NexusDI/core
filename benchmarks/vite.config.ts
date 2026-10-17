import { defineConfig } from 'vite';

// Test-only config: the harness is private and runs from source, so it has
// no build. Nx infers the `test` target from this file.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../node_modules/.vite/benchmarks',
  // Vite's tsconfig auto-discovery can walk out of a git worktree (see
  // libs/core/vite.config.ts), so the file is named explicitly.
  tsconfig: './tsconfig.json',
  test: {
    fsModuleCachePath: '../node_modules/.vite/benchmarks/fs-modules',
    name: '@nexusdi/benchmarks',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Cell tests install competitor pins over the network; the check
    // target runs them through vitest.cells.config.ts.
    exclude: ['src/**/*.cell.test.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
