import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

import { CHECKOUT, CHECKOUT_PATH, PORT } from './src/support/port.mjs';

const baseURL = process.env['BASE_URL'] ?? `http://localhost:${PORT}`;

/**
 * Runs against the static export served under /next/ by a server that
 * behaves like GitHub Pages (spec §17.3), in the three engines.
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.filename, { testDir: './src' }),
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node apps/docs-e2e/src/support/serve.mjs',
    // The server answers 200 here for this checkout only, so a server
    // another checkout left on the port is never reused (`port.mjs`). CI and
    // `DOCS_E2E_FRESH=1` always start a fresh one.
    url: `http://localhost:${PORT}${CHECKOUT_PATH}?checkout=${CHECKOUT}`,
    reuseExistingServer:
      !process.env['CI'] && process.env['DOCS_E2E_FRESH'] !== '1',
    cwd: workspaceRoot,
    // The first run builds the site.
    timeout: 600_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
