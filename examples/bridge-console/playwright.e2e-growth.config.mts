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
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /(life-support|safety|airlock|helm|comms)\.spec\.ts/,
    },
    // Life support's online command is one-way on the shared manual ship, so
    // its case runs after every case that reads the idle ship.
    {
      name: 'life-support',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /life-support\.spec\.ts/,
      dependencies: ['chromium'],
    },
    // The safety case floods the reactor bay, which then holds too little
    // oxygen for a second drill fire, so the case runs once, after every case
    // that reads the unflooded ship.
    {
      name: 'safety',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /safety\.spec\.ts/,
      dependencies: ['life-support'],
    },
    // The airlock case needs life support online, and it reads the doors and
    // the alarms after the safety case has left them shut and clear.
    {
      name: 'airlock',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /airlock\.spec\.ts/,
      dependencies: ['safety'],
    },
    // The helm case raises the throttle to 0.6 and leaves the main drive
    // burning at 600 MW, so it runs after every case that reads the ship at
    // throttle 0.01.
    {
      name: 'helm',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /helm\.spec\.ts/,
      dependencies: ['airlock'],
    },
    // The hail stays queued on the shared ship for good, because the ship has
    // no subspace link, so the comms case runs after every other case.
    {
      name: 'comms',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /comms\.spec\.ts/,
      dependencies: ['helm'],
    },
  ],
});
