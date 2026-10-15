import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env['PORT'] ?? 4210);
const baseURL = process.env['BASE_URL'] ?? `http://127.0.0.1:${port}`;

/**
 * The built examples/react-ssr app under react-router-serve, as it runs in
 * production. The e2e target builds the app first (package.json).
 */
export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  use: { baseURL, trace: 'on-first-retry' },
  webServer: {
    command: 'npx react-router-serve ./build/server/index.js',
    url: baseURL,
    reuseExistingServer: false,
    cwd: `${workspaceRoot}/examples/react-ssr`,
    env: { PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
