import type { Page } from '@playwright/test';

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
