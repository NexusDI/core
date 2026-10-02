import { expect, test } from '@playwright/test';

test('the /next/ overview renders its heading', async ({ page }) => {
  await page.goto('/next/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'NexusDI' }),
  ).toBeVisible();
});

test('the tokens page renders under /next/', async ({ page }) => {
  await page.goto('/next/tokens/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tokens' }),
  ).toBeVisible();
});
