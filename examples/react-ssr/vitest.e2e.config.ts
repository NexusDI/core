import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: '@nexusdi/react-ssr:e2e',
    include: ['e2e/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
