import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/examples/bridge-api',
  test: {
    name: '@nexusdi/bridge-api',
    watch: false,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    benchmark: { include: ['bench/**/*.bench.ts'] },
    reporters: ['default'],
  },
});
