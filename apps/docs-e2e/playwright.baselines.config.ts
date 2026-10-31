import { defineConfig, devices } from '@playwright/test';

/**
 * Regenerates the Chromium baselines of `front-page.spec.ts` in the Playwright
 * image that CI's `docs-e2e` job runs in (`mcr.microsoft.com/playwright`, at
 * the version the lockfile installs), so a local run draws what CI compares. It
 * runs against a site that is already built and served, so it needs no Nx and
 * no web server:
 *
 *   node apps/docs-e2e/src/support/serve.mjs   # builds and serves .site, or serve .site yourself
 *   docker run --rm --ipc=host -v "$PWD":/work -w /work \
 *     -e BASE_URL=http://host.docker.internal:<port> \
 *     mcr.microsoft.com/playwright:v<playwright version>-noble \
 *     npx playwright test -c apps/docs-e2e/playwright.baselines.config.ts --update-snapshots
 *
 * The default config skips these tests outside Linux: another platform renders
 * the text and the lit scene differently, so commit only baselines that this
 * config drew in the image.
 */
export default defineConfig({
  testDir: './src',
  testMatch: 'front-page.spec.ts',
  grep: /the bay baselines/,
  snapshotPathTemplate:
    '{testDir}/{testFileName}-snapshots/{arg}-{projectName}{ext}',
  outputDir: './test-output/baselines',
  reporter: 'list',
  // The software GL of the container is slow, so one worker draws each frame.
  workers: 1,
  retries: 1,
  use: { baseURL: process.env['BASE_URL'], trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
