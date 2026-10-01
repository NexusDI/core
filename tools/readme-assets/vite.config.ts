import { defineConfig } from 'vite';

// Test-only config: readme-assets holds the README graph and the check that
// it is fresh. Nx infers the `test` target from this file.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/tools/readme-assets',
  // Vite's tsconfig auto-discovery can walk out of a git worktree (see
  // libs/core/vite.config.ts), so the file is named explicitly.
  tsconfig: './tsconfig.json',
  test: {
    name: '@nexusdi/readme-assets',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
    // Each case spawns the built cli, and SVG loads Graphviz as WebAssembly.
    testTimeout: 60_000,
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
