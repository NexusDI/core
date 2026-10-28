import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';

import { REMOTE_DISTS, SHELL_DIST } from './e2e/dists.ts';
import { SHELLS } from './e2e/ports.ts';
import { serve } from './playwright.servers.mts';

/**
 * Three instances of the shell's e2e build, one per remote list, and the
 * four remote builds they load. The e2e target builds
 * every one of them first (project.json). The growth cases under e2e/growth
 * run only in the e2e-growth target (playwright.e2e-growth.config.mts).
 * Playwright prefixes a glob with a double star segment itself and Nx's
 * e2e-ci inference does not, so the glob carries that prefix.
 *
 * Generated as a .mts file so Node forces ESM regardless of workspace
 * `type`. Playwright routes `.mts` through its ESM loader, and Nx's native
 * TS strip loads `.mts` directly.
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './e2e' }),
  testIgnore: '**/growth/**',
  use: {
    baseURL: `http://127.0.0.1:${SHELLS.main}`,
    trace: 'on-first-retry',
  },
  webServer: [
    ...REMOTE_DISTS.map(({ dist, port }) =>
      serve(dist, port, '/remoteEntry.js'),
    ),
    ...(['main', 'drift', 'unshared'] as const).map((list) =>
      serve(SHELL_DIST, SHELLS[list], '/', {
        REMOTES: list,
      }),
    ),
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
