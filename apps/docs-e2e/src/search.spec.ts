import { expect, test } from '@playwright/test';

/**
 * Nextra's search imports `addBasePath('/_pagefind/pagefind.js')` and navigates
 * through next/link, which adds the base path once. Pagefind indexes `out/`
 * with no `--base-url`, so a result's URL is root-relative (spec §15.4).
 */
test.describe('search under /next/', () => {
  // Nextra links only Pagefind's sub-results; a match in the intro, before the
  // first heading, gets the page URL without a hash.
  test('a page result opens the page', async ({ page }) => {
    await page.goto('/next/');
    await page
      .locator('input[type="search"]')
      .first()
      .fill('has no runtime value of its own');

    const result = page
      .getByRole('option')
      .and(page.locator('a[href="/next/tokens/"]'))
      .first();
    await expect(result).toBeVisible({ timeout: 15_000 });
    await result.click();
    await expect(page).toHaveURL(/\/next\/tokens\/$/);
  });

  test('a sub-result opens the heading anchor and scrolls to it', async ({
    page,
  }) => {
    await page.goto('/next/');
    await page.locator('input[type="search"]').first().fill('identity');

    const anchor = page
      .getByRole('option')
      .and(
        page.locator(
          'a[href="/next/tokens/#nexusdi-compares-tokens-by-identity"]',
        ),
      )
      .first();
    await expect(anchor).toBeVisible({ timeout: 15_000 });
    await anchor.click();

    await expect(page).toHaveURL(
      /\/next\/tokens\/#nexusdi-compares-tokens-by-identity$/,
    );
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: /NexusDI compares tokens by identity/,
      }),
    ).toBeInViewport();
  });
});
