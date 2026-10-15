import { expect, test, type Page } from '@playwright/test';

/** Console errors and warnings, and uncaught page errors, from `page`. */
function problems(page: Page): string[] {
  const seen: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      seen.push(message.text());
  });
  page.on('pageerror', (error) => seen.push(error.message));
  return seen;
}

test('renders a document request with the request mission and its own flight log', async ({
  request,
}) => {
  const res = await request.get('/', {
    headers: { 'x-mission-id': 'survey-9' },
  });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('survey-9: docked');
  // The ScopeProvider around the plotter sends its fallback in the server HTML.
  expect(html).toContain('Warming up the plotter');
});

test('hydrates with no NEXUS_SCOPE_REQUIRED and no hydration warning', async ({
  page,
}) => {
  const seen = problems(page);
  await page.goto('/');
  await expect(page.getByText('heading 117')).toBeVisible();
  await expect(page.getByText('Warming up the plotter')).toHaveCount(0);
  expect(seen).toEqual([]);
});

test('navigates to the lazy sectors route through a .data request', async ({
  page,
}) => {
  const seen = problems(page);
  await page.goto('/');
  await expect(page.getByText('heading 117')).toBeVisible();
  const data = page.waitForResponse(/\/sectors\/Kepler-442b\.data/);
  await page.getByRole('link', { name: 'Sectors' }).click();
  expect((await data).status()).toBe(200);
  await expect(page.getByText('Kepler-442b: heading 42')).toBeVisible();
  expect(seen).toEqual([]);
});

test('answers 404 for a path no route matches', async ({ page }) => {
  const res = await page.goto('/uncharted');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
});
