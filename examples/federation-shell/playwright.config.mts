import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

import { REMOTE_DISTS, SHELL_DIST } from './e2e/dists.ts';
import { SHELLS } from './e2e/ports.ts';

const cwd = `${workspaceRoot}/examples`;

/** One static server from e2e/serve.ts, ready once `ready` answers. */
function serve(folder: string, port: number, ready: string, remotes?: string) {
  const env: Record<string, string> =
    remotes === undefined ? {} : { REMOTES: remotes };
  return {
    command: `node federation-shell/e2e/serve.ts ${folder} ${port}`,
    url: `http://127.0.0.1:${port}${ready}`,
    reuseExistingServer: false,
    cwd,
    env,
  };
}

/**
 * Three instances of the shell's e2e build, one per remote list, and the
 * four remote builds they load (demo apps spec 7.5). The e2e target builds
 * every one of them first (project.json).
 *
 * Generated as a .mts file so Node forces ESM regardless of workspace
 * `type`. Playwright routes `.mts` through its ESM loader, and Nx's native
 * TS strip loads `.mts` directly.
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './e2e' }),
  use: {
    baseURL: `http://127.0.0.1:${SHELLS.main}`,
    trace: 'on-first-retry',
  },
  webServer: [
    ...REMOTE_DISTS.map(({ dist, port }) =>
      serve(dist, port, '/remoteEntry.js'),
    ),
    ...(['main', 'drift', 'unshared'] as const).map((list) =>
      serve(
        SHELL_DIST,
        SHELLS[list],
        '/',
        `federation-shell/e2e/remotes/${list}.json`,
      ),
    ),
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
