import { expect, test } from '@playwright/test';

test.describe('the root 404 page during the RC', () => {
  test('sends a missing /next/ path to the new site 404 page', async ({
    page,
  }) => {
    await page.goto('/next/this-page-does-not-exist/');
    await expect(page).toHaveURL(/\/next\/404\.html$/);
    await expect(page.getByText('Snapshot 404 fixture')).toHaveCount(0);
  });

  test('keeps the 0.3 404 page for a missing root path', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist/');
    expect(response?.status()).toBe(404);
    await expect(page.getByText('Snapshot 404 fixture')).toBeVisible();
  });
});
