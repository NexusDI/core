import { defineConfig } from 'vite';

// Runs the *.cell.test.ts files: renderer cells that install competitor
// pins with npm, so they need the network. The check target runs them;
// vite.config.ts (the test target) excludes them.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../node_modules/.vite/benchmarks-cells',
  tsconfig: './tsconfig.json',
  test: {
    fsModuleCachePath: '../node_modules/.vite/benchmarks-cells/fs-modules',
    name: '@nexusdi/benchmarks (cells)',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.cell.test.ts'],
    reporters: ['default'],
  },
}));
