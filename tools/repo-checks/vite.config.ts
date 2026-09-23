import { defineConfig } from 'vite';

// Test-only config: tools/repo-checks holds workspace invariants, not shipped
// code. Nx infers a project's `test` target from a project-local
// vite.config.ts/vitest.config.ts, which is what puts these checks into
// `nx run-many -t test`, CI and the release gate.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/tools/repo-checks',
  // Vite's own tsconfig auto-discovery walks parent directories with no
  // boundary at the workspace root, which can escape a git worktree
  // entirely (see libs/core/vite.config.ts). Naming the file explicitly
  // avoids that.
  tsconfig: './tsconfig.json',
  test: {
    name: '@nexusdi/repo-checks',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    // The project graph is slower than a unit test.
    testTimeout: 120_000,
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
