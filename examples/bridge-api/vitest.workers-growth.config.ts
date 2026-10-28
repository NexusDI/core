import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// The growth cases on workerd. Only the
// e2e-growth target runs this config, and vitest.workers.config.ts excludes
// test/worker/growth/, so the gating test-workers target runs none of them.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { SIGNAL: 'on' } },
    }),
  ],
  test: {
    fsModuleCachePath:
      '../../node_modules/.vite/examples/bridge-api-workers-growth/fs-modules',
    name: '@nexusdi/bridge-api:workers-growth',
    include: ['test/worker/growth/**/*.test.ts'],
  },
});
