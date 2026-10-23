import { expect, test as base, type Page } from '@playwright/test';

export { expect };

/** The hosts the suite serves: the console and the bridge API. */
const LOCAL = new Set(['127.0.0.1', 'localhost']);

/**
 * Playwright's test, with every request to another host aborted. The
 * console loads nothing from the internet, so a page that fetches from
 * outside fails its case through the console error the abort logs.
 */
export const test = base.extend<{ localOnly: void }>({
  localOnly: [
    async ({ context }, use) => {
      await context.route('**/*', (route) =>
        LOCAL.has(new URL(route.request().url()).hostname)
          ? route.fallback()
          : route.abort('blockedbyclient'),
      );
      await use();
    },
    { auto: true },
  ],
});

/**
 * Waits until React commits the course route's flight log on the client:
 * an effect inside the flight log's Suspense boundary sets `data-flight-log`
 * on the html element. A case that waits here before it reads `problems`
 * sees the errors of that boundary's hydration or client render too.
 */
export async function flightLogCommitted(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute(
    'data-flight-log',
    'committed',
  );
}

/** Console errors and warnings, and uncaught page errors, from `page`. */
export function problems(page: Page): string[] {
  const seen: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      seen.push(message.text());
  });
  page.on('pageerror', (error) => seen.push(error.message));
  return seen;
}
