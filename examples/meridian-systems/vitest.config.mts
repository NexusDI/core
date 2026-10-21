import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/examples/meridian-systems',
  test: {
    fsModuleCachePath:
      '../../node_modules/.vite/examples/meridian-systems/fs-modules',
    name: '@nexusdi/meridian-systems',
    watch: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
