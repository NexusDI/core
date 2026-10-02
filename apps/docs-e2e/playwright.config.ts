import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['BASE_URL'] ?? 'http://localhost:4310';

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
    url: 'http://localhost:4310/next/',
    reuseExistingServer: !process.env['CI'],
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
