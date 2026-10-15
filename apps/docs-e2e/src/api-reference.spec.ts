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

for (const theme of ['dark', 'light'] as const) {
  test(`states the type of a signature token on hover and on focus in ${theme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(PAGE);
    const hover = page
      .locator('.nexus-api-entry__signature .nexus-popup')
      .filter({ has: page.getByRole('button', { name: 'nodeScopes' }) })
      .first();
    const panel = hover.locator('.nexus-popup__panel');

    // The type is in the HTML before any script runs.
    await expect(panel).toHaveCount(1);
    await expect(panel).toBeHidden();

    await hover.getByRole('button').hover();
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('NodeScopes');

    await page.mouse.move(0, 0);
    await expect(panel).toBeHidden();

    await hover.getByRole('button').focus();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });
}

test('toggles a type on tap and closes it on a tap outside', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'webkit', 'the touch case runs in WebKit, as iOS');
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto(PAGE);
  const hover = page
    .locator('.nexus-api-entry__signature .nexus-popup')
    .first();
  const panel = hover.locator('.nexus-popup__panel');

  await hover.getByRole('button').tap();
  await expect(panel).toBeVisible();
  await hover.getByRole('button').tap();
  await expect(panel).toBeHidden();

  await hover.getByRole('button').tap();
  await expect(panel).toBeVisible();
  await page.locator('h1').tap();
  await expect(panel).toBeHidden();
  await context.close();
});

test('walks a fence from one tab stop with the arrow keys', async ({
  page,
}) => {
  await page.goto(PAGE);
  // The first fence with two typed tokens, so an arrow has somewhere to go.
  const marked = await page
    .locator('.nexus-api-entry pre')
    .evaluateAll((all) => {
      const found = all.find(
        (each) => each.querySelectorAll('.nexus-popup__button').length >= 2,
      );
      found?.setAttribute('data-walked', '');
      return found !== undefined;
    });
  expect(marked).toBe(true);
  const fence = page.locator('pre[data-walked]');
  const tokens = fence.locator('.nexus-popup__button');
  await expect(fence.locator('.nexus-popup__button[tabindex="0"]')).toHaveCount(
    1,
  );

  const onToken = () =>
    fence.evaluate((element) =>
      [...element.querySelectorAll('.nexus-popup__button')].includes(
        document.activeElement as Element,
      ),
    );

  // Nextra makes a scrolling <pre> focusable and puts a copy button by it.
  // Tab from the <pre> reaches the fence's one token stop, past the copy
  // button.
  await fence.focus();
  for (let presses = 0; presses < 5 && !(await onToken()); presses += 1)
    await page.keyboard.press('Tab');
  await expect(tokens.first()).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(tokens.nth(1)).toBeFocused();
  const second = page.locator(
    `[id="${await tokens.nth(1).getAttribute('aria-describedby')}"]`,
  );
  await expect(second).toBeVisible();
  await expect(second).not.toBeEmpty();

  // The next Tab leaves the fence's tokens for whatever follows them.
  await page.keyboard.press('Tab');
  expect(await onToken()).toBe(false);
});

test('shows the type on Tab after a tap', async ({ browser, browserName }) => {
  test.skip(browserName !== 'webkit', 'the touch case runs in WebKit, as iOS');
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto(PAGE);
  const fence = page.locator('.nexus-api-entry__signature pre').first();
  const hover = fence.locator('.nexus-popup').first();
  const panel = hover.locator('.nexus-popup__panel');

  await hover.getByRole('button').tap();
  await expect(panel).toBeVisible();
  await page.locator('h1').tap();
  await expect(panel).toBeHidden();

  await fence.focus();
  for (
    let presses = 0;
    presses < 5 &&
    !(await hover
      .getByRole('button')
      .evaluate((button) => button === document.activeElement));
    presses += 1
  )
    await page.keyboard.press('Tab');
  await expect(hover.getByRole('button')).toBeFocused();
  await expect(panel).toBeVisible();
  await context.close();
});

test('keeps a long panel open while the reader scrolls inside it', async ({
  page,
}) => {
  await page.goto(PAGE);
  const hover = page
    .locator('.nexus-api-entry__signature .nexus-popup')
    .first();
  const panel = hover.locator('.nexus-popup__panel');
  await hover.getByRole('button').hover();
  await expect(panel).toBeVisible();

  // Any panel taller than its cap scrolls; this one is capped so it does.
  await panel.evaluate((element) => {
    element.style.maxHeight = '1.5em';
  });
  expect(
    await panel.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);

  await panel.hover();
  await page.mouse.wheel(0, 40);
  await expect
    .poll(() => panel.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(panel).toBeVisible();
});

test('toggles the type with Enter', async ({ page }) => {
  await page.goto(PAGE);
  const fence = page.locator('.nexus-api-entry__signature pre').first();
  const button = fence.locator('.nexus-popup__button').first();
  const panel = fence.locator('.nexus-popup__panel').first();

  await fence.focus();
  for (
    let presses = 0;
    presses < 5 &&
    !(await button.evaluate((each) => each === document.activeElement));
    presses += 1
  )
    await page.keyboard.press('Tab');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(panel).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
});
