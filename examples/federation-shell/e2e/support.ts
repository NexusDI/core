import type { ConsoleMessage, Page } from '@playwright/test';

/**
 * The text of a console message. Its first Error argument reads as the
 * error's message, since the minified bundles give the error class a
 * one-letter name, which is all `message.text()` shows.
 */
async function textOf(message: ConsoleMessage): Promise<string> {
  for (const arg of message.args()) {
    const error = await arg
      .evaluate((value) => (value instanceof Error ? value.message : undefined))
      .catch(() => undefined);
    if (error !== undefined) return error;
  }
  return message.text();
}

/**
 * Console errors and warnings, and uncaught page errors, from `page`. Read
 * the list with `await seen()` once the page has settled.
 */
export function problems(page: Page): () => Promise<string[]> {
  const seen: Promise<string>[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      seen.push(textOf(message));
  });
  page.on('pageerror', (error) => seen.push(Promise.resolve(error.message)));
  return () => Promise.all(seen);
}
