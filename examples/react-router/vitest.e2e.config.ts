import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/e2e.setup.ts'],
    globals: true,
    css: true,
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, './app'),
    },
  },
}); 