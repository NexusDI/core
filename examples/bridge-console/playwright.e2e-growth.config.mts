import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';

import { GROWTH_PORTS, webServers } from './playwright.servers.mts';

/**
 * The growth suite, which only the e2e-growth target runs (owner ruling 1),
 * on GROWTH_PORTS.
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './e2e/growth' }),
  use: {
    baseURL: `http://127.0.0.1:${GROWTH_PORTS.console}`,
    trace: 'on-first-retry',
  },
  webServer: webServers(GROWTH_PORTS),
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
