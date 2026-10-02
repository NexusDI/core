import { expect, test } from '@playwright/test';

/**
 * Every NexusDI error message ends with https://nexus.js.org/errors/<CODE>.
 * During the RC the root is the 0.3 snapshot, and a stub there sends the
 * reader to the code page under /next/ (docs spec §15.5).
 */
test('the link in an error message reaches its code page', async ({ page }) => {
  await page.goto('/errors/NEXUS_MISSING_PROVIDER');
  await expect(page).toHaveURL(/\/next\/errors\/NEXUS_MISSING_PROVIDER\/$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'NEXUS_MISSING_PROVIDER' }),
  ).toBeVisible();
});
