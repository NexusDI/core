import { workspaceRoot } from '@nx/devkit';
import type { PlaywrightTestConfig } from '@playwright/test';

/** The ports one suite's two servers listen on. */
export interface SuitePorts {
  readonly console: number;
  readonly api: number;
}

/** The gating suite's ports (playwright.config.mts). */
export const GATING_PORTS: SuitePorts = { console: 4210, api: 4211 };

/**
 * The growth suite's ports (playwright.e2e-growth.config.mts), beside the
 * gating suite's, so the two suites can run at once.
 */
export const GROWTH_PORTS: SuitePorts = { console: 4220, api: 4221 };

/**
 * The built console under react-router-serve, as it runs in production,
 * and bridge-api's Hono entry, which the console's loaders call over HTTP.
 * The gating and the growth configs each start their own pair. The e2e and e2e-growth targets
 * build the console first (package.json).
 */
export function webServers(
  ports: SuitePorts,
): NonNullable<PlaywrightTestConfig['webServer']> {
  const bridgeApiUrl = `http://127.0.0.1:${ports.api}/`;
  return [
    {
      command: 'node --import tsx ../bridge-api/src/server.hono.ts',
      url: `${bridgeApiUrl}health`,
      reuseExistingServer: false,
      cwd: `${workspaceRoot}/examples/bridge-console`,
      env: {
        PORT: String(ports.api),
        // Every e2e server runs a manual ship on seed 7 (spec 8.3).
        SIM_MODE: 'manual',
        SIM_SEED: '7',
      },
    },
    {
      command: 'npx react-router-serve ./build/server/index.js',
      url: `http://127.0.0.1:${ports.console}`,
      reuseExistingServer: false,
      cwd: `${workspaceRoot}/examples/bridge-console`,
      env: {
        PORT: String(ports.console),
        HOST: '127.0.0.1',
        NODE_ENV: 'production',
        BRIDGE_API_URL: bridgeApiUrl,
      },
    },
  ];
}
