import { defineConfig } from 'vite';

// The dispatch benchmark's own tests (spec 17.3). They bundle core from
// source with esbuild, so they stay out of the main suite's include.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/core/bench',
  // Named explicitly so Vite's tsconfig discovery stays in this worktree
  // (see libs/core/vite.config.ts).
  tsconfig: '../tsconfig.spec.json',
  test: {
    name: '@nexusdi/core:bench',
    watch: false,
    include: ['**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
}));
