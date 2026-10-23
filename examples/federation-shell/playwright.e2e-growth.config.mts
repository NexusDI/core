import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';

import { GROWTH_DISTS, SHELL_DIST } from './e2e/dists.ts';
import { GROWTH } from './e2e/ports.ts';
import { bridgeApi, serve } from './playwright.servers.mts';

const shell = `http://127.0.0.1:${GROWTH.shell}`;

/**
 * The growth suite, which only the e2e-growth target runs: one shell that
 * loads the command, engineering and life-support remotes, and a manual
 * bridge-api the stations read and command, all on the GROWTH ports.
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './e2e/growth' }),
  // The growth cases share one stateful manual ship, so they run one at a
  // time, once each.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: shell,
    trace: 'retain-on-failure',
  },
  webServer: [
    bridgeApi(GROWTH.api, shell),
    ...GROWTH_DISTS.map(({ dist, port }) =>
      serve(dist, port, '/remoteEntry.js'),
    ),
    serve(SHELL_DIST, GROWTH.shell, '/', {
      REMOTES: 'federation-shell/e2e/remotes/growth.json',
      BRIDGE_API_URL: `http://127.0.0.1:${GROWTH.api}/`,
    }),
  ],
  projects: [
    {
      name: 'engineering',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /engineering\.spec\.ts/,
    },
    // Each case advances the shared ship one tick, so the command case reads
    // its tick after the engineering case.
    {
      name: 'command',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /command\.spec\.ts/,
      dependencies: ['engineering'],
    },
    // Life support has no offline command, so its case runs last.
    {
      name: 'life-support',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /life-support\.spec\.ts/,
      dependencies: ['command'],
    },
  ],
});
