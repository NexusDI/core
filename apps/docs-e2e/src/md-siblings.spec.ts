import { expect, test } from '@playwright/test';

test('a page has a .md sibling under /next/', async ({ request }) => {
  const response = await request.get('/next/tokens.md');

  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('# Tokens and interfaces');
});

test('the landing page has an index.md sibling', async ({ request }) => {
  const response = await request.get('/next/index.md');

  expect(response.status()).toBe(200);
  const text = await response.text();
  // The sibling is the page's source, so its H1 is the page's headline and its
  // frontmatter keeps the title.
  expect(text).toContain(
    '# If it type-checks and starts, the wiring is right.',
  );
  expect(text).toContain('title: NexusDI');
});
