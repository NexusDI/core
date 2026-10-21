import { expect, problems, test } from './support';

test('renders a document request with the request mission and its own watch log', async ({
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

test("streams the backend's course, with the watch and flight log entries of one mission", async ({
  page,
  request,
}) => {
  // The shell goes out before the backend answers: the server HTML holds
  // the Suspense fallback, and the answer follows in the same body.
  const html = await (
    await request.get('/course/Kepler-442b', {
      headers: { 'x-mission-id': 'survey-9' },
    })
  ).text();
  expect(html).toContain('Calling the bridge');
  expect(html).toContain('survey-9: plotting Kepler-442b');

  const seen = problems(page);
  // The mission header on the console's own requests only.
  await page.route('http://127.0.0.1:4210/**', (route) =>
    route.continue({
      headers: { ...route.request().headers(), 'x-mission-id': 'survey-9' },
    }),
  );
  const res = await page.goto('/course/Kepler-442b');
  expect(res?.status()).toBe(200);
  // The console's own request scope, on the console's server.
  await expect(page.getByText('survey-9: docked')).toBeVisible();
  // The backend's request scope, on bridge-api, reached through BRIDGE_LINK.
  await expect(page.getByText('survey-9: plotting Kepler-442b')).toBeVisible();
  // The flight log entry reaches the page only if the request's scope stays
  // open until the stream ends: a disposed scope fails the backend call.
  await expect(page.getByText('Kepler-442b: heading 42')).toBeVisible();
  expect(seen).toEqual([]);
});

test('shows a failed backend call inside the stream and keeps the watch log', async ({
  request,
}) => {
  // bridge-api answers 500 for this mission (its missing-provider case).
  const res = await request.get('/course/Kepler-442b', {
    headers: { 'x-mission-id': 'missing-provider' },
  });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('missing-provider: docked');
  expect(html).toContain('The bridge did not answer.');
});

test('keeps two concurrent missions in their own request scopes', async ({
  request,
}) => {
  const [a, b] = await Promise.all(
    ['survey-1', 'survey-2'].map(async (id) =>
      (await request.get('/', { headers: { 'x-mission-id': id } })).text(),
    ),
  );
  expect(a).toContain('survey-1: docked');
  expect(a).not.toContain('survey-2');
  expect(b).toContain('survey-2: docked');
  expect(b).not.toContain('survey-1');
});

test('sends the star map fallback in the server HTML and renders StarMap after hydration', async ({
  page,
  request,
}) => {
  const html = await (await request.get('/charts')).text();
  expect(html).toContain('Unrolling the star map');
  expect(html).not.toContain('Kepler-442b: heading 42');

  const seen = problems(page);
  const chunk = page.waitForResponse(/\/assets\/cartography-[^/]+\.js$/);
  await page.goto('/charts');
  expect((await chunk).status()).toBe(200);
  await expect(page.getByText('Kepler-442b: heading 42')).toBeVisible();
  await expect(page.getByText('Unrolling the star map')).toHaveCount(0);
  expect(seen).toEqual([]);
});
