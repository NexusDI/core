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

test('the /next/ front page puts the release notice in the hero, and a guide keeps it', async ({
  page,
}) => {
  await page.goto('/next/');
  await expect(page.locator('.nexus-release')).toHaveCount(0);
  const line = page.locator('.nexus-install__release');
  await expect(line).toContainText(/\d+\.\d+\.\d+/);
  await expect(line).toContainText('current release');
  await expect(
    line.getByRole('link', { name: 'Try the release candidate.' }),
  ).toHaveAttribute('href', '/next/release-candidate/');

  await page.goto('/next/tokens/');
  await expect(page.locator('.nexus-release')).toHaveCount(1);
});
