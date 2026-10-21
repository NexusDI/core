import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';

import { webServers } from './playwright.servers.mts';

/**
 * The gating suite. The growth cases under e2e/growth run only in the
 * e2e-growth target (playwright.e2e-growth.config.mts). Playwright
 * prefixes a glob with a double star segment itself and Nx's e2e-ci
 * inference does not, so the glob carries that prefix and Nx infers no
 * e2e-ci target for a growth spec.
 *
 * Generated as a .mts file so Node forces ESM regardless of workspace
 * `type`. Playwright routes `.mts` through its ESM loader, and Nx's native
 * TS strip loads `.mts` directly.
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './e2e' }),
  testIgnore: ['**/growth/**'],
  use: {
    baseURL: 'http://127.0.0.1:4210',
    trace: 'on-first-retry',
  },
  webServer: webServers({ console: 4210, api: 4211 }),
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
