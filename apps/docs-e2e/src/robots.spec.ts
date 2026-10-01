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

  const noticeBox = await notice.boundingBox();
  const headingBox = await page.locator('article h1').boundingBox();
  expect(noticeBox!.y).toBeLessThan(headingBox!.y);
});

test('the content of a /next/ page sits in the search index region', async ({
  page,
}) => {
  await page.goto('/next/tokens/');
  await expect(page.locator('[data-pagefind-body] h1')).toHaveCount(1);
});
