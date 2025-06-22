import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      exclude: [
        'docs/**',
        'examples/**',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/test/**',
        '**/tests/**',
        '**/__tests__/**',
        '**/coverage/**',
        '**/dist/**',
        '**/node_modules/**',
        'vitest.config.ts'
      ],
    },
  },
}); 