import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Test-only config. `next build` builds the site through next.config.ts; this
 * file exists so @nx/vitest infers a `test` target for the project.
 *
 * `.mts` because the app's package.json sets no `"type": "module"`
 * (postcss-load-config reads postcss.config.js as CommonJS), so a `.ts` config
 * would load as CommonJS.
 */
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/docs',
  // tsconfig sets `jsx: preserve` for Next, which esbuild cannot run.
  plugins: [react()],
  test: {
    name: '@nexusdi/docs',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{app,components}/**/*.test.{ts,tsx}', 'tools/**/*.test.mjs'],
    reporters: ['default'],
  },
});
