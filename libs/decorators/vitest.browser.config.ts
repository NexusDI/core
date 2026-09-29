import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vite';

import { standardDecorators } from './vite.decorators.ts';

// Runs the *.browser.test.ts files in Chromium, where no `process` global
// exists (regression R20). The node project in vite.config.ts excludes them.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/decorators-browser',
  tsconfig: './tsconfig.spec.json',
  plugins: [standardDecorators()],
  test: {
    name: '@nexusdi/decorators (browser)',
    watch: false,
    globals: true,
    include: ['src/**/*.browser.test.ts'],
    // Parallel browser projects share Vite's default port and rely on Vite
    // moving to the next free one, so browser.api.strictPort stays unset.
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
}));
