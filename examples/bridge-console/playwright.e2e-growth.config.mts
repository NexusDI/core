import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';

import { GROWTH_PORTS, webServers } from './playwright.servers.mts';

/**
 * The growth suite, which only the e2e-growth target runs (tech lead, G0b
 * ruling 6), on GROWTH_PORTS.
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './e2e/growth' }),
  // The growth cases share one stateful manual ship, so they run one at a
  // time, once each.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${GROWTH_PORTS.console}`,
    trace: 'retain-on-failure',
  },
  webServer: webServers(GROWTH_PORTS),
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
