import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { configDefaults, defineConfig } from 'vitest/config';

// SIGNAL=off runs the suite against wrangler.no-signal.jsonc. The CI leg runs
// both, so /runtimes/ can state what an abort does with and without the flag.
const signal = process.env['SIGNAL'] !== 'off';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: signal ? './wrangler.jsonc' : './wrangler.no-signal.jsonc',
      },
      miniflare: { bindings: { SIGNAL: signal ? 'on' : 'off' } },
    }),
  ],
  test: {
    fsModuleCachePath:
      '../../node_modules/.vite/examples/bridge-api-workers/fs-modules',
    name: `@nexusdi/bridge-api:workers:${signal ? 'signal' : 'no-signal'}`,
    include: ['test/worker/**/*.test.ts'],
    // vitest.workers-growth.config.ts runs the growth cases.
    exclude: [...configDefaults.exclude, 'test/worker/growth/**'],
  },
});
