import type { Page } from '@playwright/test';

/**
 * Opens a page and waits until React has hydrated its search box. A `fill`
 * before that point is lost when hydration renders the box with its own empty
 * state, and how long hydration takes depends on the page and the engine.
 */
export async function gotoHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => {
    const input = document.querySelector('input[type="search"]');
    return (
      input !== null &&
      Object.keys(input).some((key) => key.startsWith('__reactProps'))
    );
  });
}
