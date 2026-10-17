import { expect, test } from '@playwright/test';

test('a /next/ page asks search engines to skip it and follow its links', async ({
  page,
}) => {
  await page.goto('/next/tokens/');

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, follow',
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://nexus.js.org/next/tokens/',
  );
});

test('a /next/ page carries the release notice above its heading', async ({
  page,
}) => {
  await page.goto('/next/tokens/');

  const notice = page.locator('.nexus-release');
  await expect(notice).toContainText('This page documents');

  await expect(notice).toBeVisible();
  const top = (element: Element) => element.getBoundingClientRect().top;
  const noticeTop = await notice.evaluate(top);
  const headingTop = await page.locator('article h1').evaluate(top);
  expect(noticeTop).toBeLessThan(headingTop);
});

test('the content of a /next/ page sits in the search index region', async ({
  page,
}) => {
  await page.goto('/next/tokens/');
  await expect(page.locator('[data-pagefind-body] h1')).toHaveCount(1);
});
