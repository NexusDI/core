import { expect, test } from '@playwright/test';

test('the /next/ overview renders its heading', async ({ page }) => {
  await page.goto('/next/');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'If it type-checks and starts, the wiring is right.',
    }),
  ).toBeVisible();
});

test('the hero anchor and the skip link reach the pre-flight check', async ({
  page,
}) => {
  await page.goto('/next/');
  await expect(page.locator('#pre-flight')).toBeAttached();
  await expect(
    page.getByRole('link', { name: 'See the pre-flight check' }),
  ).toHaveAttribute('href', '#pre-flight');
  await expect(
    page.getByRole('link', { name: 'Skip to the pre-flight check' }),
  ).toHaveAttribute('href', '#pre-flight');
});

test('the tokens page renders under /next/', async ({ page }) => {
  await page.goto('/next/tokens/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tokens' }),
  ).toBeVisible();
});
