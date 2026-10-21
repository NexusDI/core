import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';

import { webServers } from './playwright.servers.mts';

/**
 * The growth suite, which only the e2e-growth target runs (owner ruling 1).
 * Its servers listen on 4220 and 4221, beside the gating suite's 4210 and
 * 4211.
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './e2e/growth' }),
  use: {
    baseURL: 'http://127.0.0.1:4220',
    trace: 'on-first-retry',
  },
  webServer: webServers({ console: 4220, api: 4221 }),
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
