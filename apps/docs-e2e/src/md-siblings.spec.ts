import { expect, test } from '@playwright/test';

test('a page has a .md sibling under /next/', async ({ request }) => {
  const response = await request.get('/next/tokens.md');

  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('# Tokens and interfaces');
});

test('the landing page has an index.md sibling', async ({ request }) => {
  const response = await request.get('/next/index.md');

  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('# NexusDI');
});
