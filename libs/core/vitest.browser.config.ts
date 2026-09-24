import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vite';

import { standardDecorators } from './vite.decorators.ts';

// Runs the *.browser.test.ts files in Chromium, where no `process` global
// exists (regression R20). The node project in vite.config.ts excludes them.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/core-browser',
  tsconfig: './tsconfig.spec.json',
  plugins: [standardDecorators()],
  test: {
    name: '@nexusdi/core (browser)',
    watch: false,
    globals: true,
    include: ['src/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
}));
