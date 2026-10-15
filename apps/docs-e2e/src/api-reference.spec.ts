import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The first reference page, end to end: the static HTML a search index and a
 * reader without JavaScript get, the sidecar fetched under the `/next/` base
 * path, the filter, and the layout at phone width.
 */

const PAGE = '/next/api-node/';
const SIDECAR = '/next/behaviour/node/nodeScopes.json';
const CASE = /^libs\/node\/src\/.+:\d+$/;

/**
 * Scrolls the first catalogue into view and waits for its case pane. On
 * `/api-node/` the sidecar is `nodeScopes`'s; elsewhere any sidecar of the
 * page's library will do.
 */
async function openCase(page: Page, library = 'node') {
  const sidecar = page.waitForRequest((request) =>
    library === 'node'
      ? request.url().endsWith(SIDECAR)
      : request.url().includes(`/next/behaviour/${library}/`),
  );
  // An entry off the screen skips layout (`content-visibility: auto`), and
  // Firefox and WebKit give its descendants no box to scroll to, so the
  // reader's way in is the entry first, then its catalogue.
  const catalogue = page.locator('.nexus-behaviours').first();
  await page
    .locator('.nexus-api-entry', { has: catalogue })
    .first()
    .scrollIntoViewIfNeeded();
  await catalogue.scrollIntoViewIfNeeded();
  await sidecar;
  const region = page.getByRole('region', {
    name:
      library === 'node' ? CASE : new RegExp(`^libs/${library}/src/.+:\\d+$`),
  });
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

// `/api/` holds the longest signatures.
for (const [path, library] of [
  [PAGE, 'node'],
  ['/next/api/', 'core'],
] as const)
  for (const theme of ['dark', 'light'] as const) {
    test(`fits ${path} on a 375 px screen in ${theme} mode, with the case pane outside the rail`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(path);
      const region = await openCase(page, library);

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

/** The first signature token, the one card, and the token's own fence. */
const signature = (page: Page) => {
  const fence = page.locator('.nexus-api-entry__signature pre').first();
  return {
    fence,
    token: fence.locator('button[data-pop]').first(),
    card: page.locator('#nexus-type-card'),
  };
};

for (const theme of ['dark', 'light'] as const) {
  test(`states the type of a signature token on hover and on focus in ${theme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(PAGE);
    const { token, card } = signature(page);

    // The HTML carries no panel; the page's table holds them.
    const html = await (await page.request.get(PAGE)).text();
    expect(html).not.toContain('twoslash-popup-container');

    await token.hover();
    await expect(card).toBeVisible();
    await expect(card).toContainText('NodeScopes');
    expect(await token.getAttribute('aria-describedby')).toBe(
      'nexus-type-card',
    );

    await page.mouse.move(0, 0);
    await expect(card).toHaveCount(0);

    await token.focus();
    await expect(card).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
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
  const { token, card } = signature(page);

  await token.tap();
  await expect(card).toBeVisible();
  await token.tap();
  await expect(card).toHaveCount(0);

  await token.tap();
  await expect(card).toBeVisible();
  await page.locator('h1').tap();
  await expect(card).toHaveCount(0);
  await context.close();
});

/** Tabs from a fence's own <pre> until a token of it has focus. */
async function tabInto(page: Page, fence: Locator) {
  const onToken = () =>
    fence.evaluate((element) =>
      [...element.querySelectorAll('button[data-pop]')].includes(
        document.activeElement as Element,
      ),
    );
  // Nextra makes a scrolling <pre> focusable and puts a copy button by it.
  await fence.focus();
  for (let presses = 0; presses < 5 && !(await onToken()); presses += 1)
    await page.keyboard.press('Tab');
  return onToken;
}

test('walks a fence from one tab stop with the arrow keys', async ({
  page,
}) => {
  await page.goto(PAGE);
  // The first fence with two typed tokens, so an arrow has somewhere to go.
  const marked = await page
    .locator('.nexus-api-entry pre')
    .evaluateAll((all) => {
      const found = all.find(
        (each) => each.querySelectorAll('button[data-pop]').length >= 2,
      );
      found?.setAttribute('data-walked', '');
      return found !== undefined;
    });
  expect(marked).toBe(true);
  const fence = page.locator('pre[data-walked]');
  const tokens = fence.locator('button[data-pop]');
  await expect(fence.locator('button[data-pop][tabindex="0"]')).toHaveCount(1);

  const onToken = await tabInto(page, fence);
  await expect(tokens.first()).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(tokens.nth(1)).toBeFocused();
  const card = page.locator('#nexus-type-card');
  await expect(card).toBeVisible();
  await expect(card).not.toBeEmpty();
  expect(await tokens.nth(1).getAttribute('aria-describedby')).toBe(
    'nexus-type-card',
  );

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
  const { fence, token, card } = signature(page);

  await token.tap();
  await expect(card).toBeVisible();
  await page.locator('h1').tap();
  await expect(card).toHaveCount(0);

  await tabInto(page, fence);
  await expect(token).toBeFocused();
  await expect(card).toBeVisible();
  await context.close();
});

test('keeps a long card open while the reader scrolls inside it', async ({
  page,
}) => {
  await page.goto(PAGE);
  const { token, card } = signature(page);
  await token.hover();
  await expect(card).toBeVisible();

  // Any card taller than its cap scrolls; this one is capped so it does.
  await card.evaluate((element) => {
    element.style.maxHeight = '1.5em';
  });
  expect(
    await card.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);

  await card.hover();
  await page.mouse.wheel(0, 40);
  await expect
    .poll(() => card.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(card).toBeVisible();
});

test('toggles the type with Enter', async ({ page }) => {
  await page.goto(PAGE);
  const { fence, token, card } = signature(page);

  await tabInto(page, fence);
  await expect(token).toBeFocused();
  await expect(card).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(card).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(card).toBeVisible();
});

test('says the type in the live region after Tab and Enter', async ({
  page,
}) => {
  await page.goto(PAGE);
  const { fence, token, card } = signature(page);
  const spoken = page.locator('.nexus-type-card__spoken[role=status]');

  await tabInto(page, fence);
  await expect(token).toBeFocused();
  await expect(spoken).toContainText('NodeScopes');
  await page.keyboard.press('Enter');
  await expect(card).toHaveCount(0);
  await expect(spoken).toHaveText('');
  await page.keyboard.press('Enter');
  await expect(card).toBeVisible();
  await expect(spoken).toContainText('NodeScopes');
});

/**
 * Follows the first visible link to `path` and waits for the page, checking
 * the router moved there without a document load.
 */
async function navigate(page: Page, path: string) {
  await page.evaluate(() => {
    (window as { stayed?: boolean }).stayed = true;
  });
  await page.locator(`a[href="${path}"]:visible`).first().click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  expect(
    await page.evaluate(() => (window as { stayed?: boolean }).stayed),
  ).toBe(true);
}

test('shows a type after a client navigation from one API page to another', async ({
  page,
}) => {
  await page.goto(PAGE);
  const before = signature(page);
  await before.token.hover();
  await expect(before.card).toBeVisible();
  await page.mouse.move(0, 0);

  await navigate(page, '/next/api-testing/');
  await expect(page.locator('h1')).toContainText('@nexusdi/testing');
  const after = signature(page);
  await after.token.hover();
  await expect(after.card).toBeVisible();
  await expect(after.card).not.toBeEmpty();
});

test('shows a type after a client navigation from a guide to an API page', async ({
  page,
}) => {
  await page.goto('/next/scopes/');
  await expect(page.locator('button[data-pop]')).toHaveCount(0);

  await navigate(page, PAGE);
  const { token, card } = signature(page);
  await token.hover();
  await expect(card).toBeVisible();
  await expect(card).toContainText('NodeScopes');
});

/**
 * The card's box is inside the window and touches its token's row: just
 * above it or just below. A card placed from a containing block other than
 * the window lands elsewhere, as it did under Nextra's article, whose
 * backdrop-filter makes it the box a fixed descendant is placed in.
 */
async function expectBeside(page: Page, card: Locator, token: Locator) {
  const viewport = page.viewportSize();
  const at = await token.boundingBox();
  const box = await card.boundingBox();
  if (!viewport || !at || !box) throw new Error('no box to measure');
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  const below = Math.abs(box.y - (at.y + at.height));
  const above = Math.abs(at.y - (box.y + box.height));
  expect(Math.min(below, above)).toBeLessThan(12);
}

for (const path of [PAGE, '/next/api-devtools/'])
  test(`places a fence token's card beside it on ${path}`, async ({ page }) => {
    await page.goto(path);
    const { token, card } = signature(page);
    await token.scrollIntoViewIfNeeded();
    await token.hover();
    await expect(card).toBeVisible();
    await expectBeside(page, card, token);
  });

test("places a catalogue token's card beside it", async ({ page }) => {
  await page.goto(PAGE);
  const region = await openCase(page);
  const token = region.locator('.twoslash-hover[data-pop]').first();
  await token.hover();
  const card = page.locator('.nexus-behaviours__type:not([hidden])');
  await expect(card).toBeVisible();
  await expectBeside(page, card, token);
});
