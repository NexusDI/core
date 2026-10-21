import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

const baseURL = 'http://127.0.0.1:4210';
/** Where the bridge API listens, which the console's server calls. */
const bridgeApiUrl = 'http://127.0.0.1:4211/';

/**
 * The built console under react-router-serve, as it runs in production,
 * and bridge-api's Hono entry, which the console's loaders call over HTTP.
 * The e2e target builds the console first (package.json).
 *
 * Generated as a .mts file so Node forces ESM regardless of workspace
 * `type`. Playwright routes `.mts` through its ESM loader, and Nx's native
 * TS strip loads `.mts` directly.
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './e2e' }),
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'node --import tsx ../bridge-api/src/server.hono.ts',
      url: `${bridgeApiUrl}health`,
      reuseExistingServer: false,
      cwd: `${workspaceRoot}/examples/bridge-console`,
      env: {
        PORT: '4211',
        // Every e2e server runs a manual ship on seed 7 (spec 8.3).
        SIM_MODE: 'manual',
        SIM_SEED: '7',
      },
    },
    {
      command: 'npx react-router-serve ./build/server/index.js',
      url: baseURL,
      reuseExistingServer: false,
      cwd: `${workspaceRoot}/examples/bridge-console`,
      env: {
        PORT: '4210',
        HOST: '127.0.0.1',
        NODE_ENV: 'production',
        BRIDGE_API_URL: bridgeApiUrl,
      },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
