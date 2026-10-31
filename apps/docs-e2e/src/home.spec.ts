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

test('the hero anchor reaches the pre-flight check', async ({ page }) => {
  await page.goto('/next/');
  await expect(page.locator('#pre-flight')).toBeAttached();
  await expect(
    page.getByRole('link', { name: 'See the pre-flight check' }),
  ).toHaveAttribute('href', '#pre-flight');
});

test('the tokens page renders under /next/', async ({ page }) => {
  await page.goto('/next/tokens/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tokens' }),
  ).toBeVisible();
});

test('the page does not scroll sideways at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/next/');
  await expect(page.locator('#pre-flight')).toBeAttached();
  const overflow = await page.evaluate(() => {
    const root = document.scrollingElement;
    return (root?.scrollWidth ?? 0) - window.innerWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
});
