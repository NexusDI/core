import { expect, test, type Page } from '@playwright/test';

/**
 * The first reference page, end to end: the static HTML a search index and a
 * reader without JavaScript get, the sidecar fetched under the `/next/` base
 * path, the filter, and the layout at phone width.
 */

const PAGE = '/next/api-node/';
const SIDECAR = '/next/behaviour/node/nodeScopes.json';
const CASE = /^libs\/node\/src\/.+:\d+$/;

/** Scrolls the first catalogue into view and waits for its case pane. */
async function openCase(page: Page) {
  const sidecar = page.waitForRequest((request) =>
    request.url().endsWith(SIDECAR),
  );
  await page.locator('.nexus-behaviours').first().scrollIntoViewIfNeeded();
  await sidecar;
  const region = page.getByRole('region', { name: CASE });
  await expect(region).toBeVisible();
  return region;
}

test('serves every entry and every sentence in the static HTML', async ({
  request,
}) => {
  const html = await (await request.get(PAGE)).text();
  expect(html.match(/class="nexus-api-entry /g)).toHaveLength(2);
  expect(html).toContain('keeps two runs apart');
});

test('loads the cases from under the base path', async ({ page }) => {
  await page.goto(PAGE);
  await openCase(page);
});

test('shows every entry and sentence with JavaScript off, and no filter row', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(PAGE);

  await expect(page.locator('.nexus-api-entry')).toHaveCount(2);
  await expect(page.locator('.nexus-api-entry:visible')).toHaveCount(2);
  await expect(page.getByText('keeps two runs apart').first()).toBeVisible();
  await expect(page.locator('.nexus-api-filter')).toBeHidden();
  // The rail's rules ship with the shell, so the rail is styled without the
  // pane's code: it scrolls inside the frame.
  expect(
    await page
      .locator('.nexus-behaviours__rail')
      .first()
      .evaluate((rail) => getComputedStyle(rail).overflowY),
  ).toBe('auto');
  await context.close();
});

// `nodeScopes` and `NodeScopes` match one case-insensitive query, so the kind
// toggle is what narrows this page to one entry.
test('narrows the entries, says how many match, and keeps every one in the page', async ({
  page,
}) => {
  await page.goto(PAGE);
  const shown = page.locator('.nexus-api-entry:not([hidden])');
  const status = (text: string) =>
    page.getByRole('status').filter({ hasText: text });

  await page
    .getByRole('searchbox', { name: 'Filter the exports by name' })
    .fill('zzz');
  await expect(shown).toHaveCount(0);
  await expect(page.locator('.nexus-api-entry')).toHaveCount(2);
  await expect(status('0 of 2')).toHaveCount(1);
  await expect(status('Nothing matches')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(shown).toHaveCount(2);

  await page.getByRole('button', { name: 'interface 1' }).click();
  await expect(shown).toHaveCount(1);
  await expect(status('1 of 2')).toHaveCount(1);
});

for (const theme of ['dark', 'light'] as const) {
  test(`fits a 375 px screen in ${theme} mode, with the case pane outside the rail`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(PAGE);
    const region = await openCase(page);

    expect(
      await region.evaluate(
        (element) => element.closest('[role=listbox]') === null,
      ),
    ).toBe(true);
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(client);
  });
}
