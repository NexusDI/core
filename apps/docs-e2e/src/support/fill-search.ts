import { expect, type Page } from '@playwright/test';

/**
 * Types into the search box and holds until the box keeps the text. A fill
 * before React hydrates the box is lost when hydration renders it empty, and
 * how long hydration takes depends on the page and the engine, so the fill and
 * its check retry until they hold.
 */
export async function fillSearch(page: Page, text: string): Promise<void> {
  const input = page.locator('input[type="search"]').first();
  await expect(async () => {
    await input.fill(text);
    await expect(input).toHaveValue(text, { timeout: 500 });
  }).toPass({ timeout: 15_000 });
}
