import { expect, test } from '@playwright/test';

/**
 * The docs chrome of site UX spec 13: the navbar, the sidebar, the page's
 * furniture, the footer, the skip link and the search's band filter.
 */

test('the navbar has the ship icon, the name and no Features entry', async ({
  page,
}) => {
  await page.goto('/next/scopes/');
  const navbar = page.locator('.nextra-navbar');
  await expect(navbar.getByText('NexusDI')).toBeVisible();
  await expect(navbar.locator('svg.nexus-shipmark')).toBeVisible();
  await expect(navbar.getByRole('link', { name: 'Docs' })).toBeVisible();
  await expect(navbar.getByRole('link', { name: 'Features' })).toHaveCount(0);
});

test('the footer lists the ship systems, the license, GitHub and npm', async ({
  page,
}) => {
  await page.goto('/next/scopes/');
  const systems = page.getByRole('navigation', { name: 'Ship systems' });
  await expect(systems.getByRole('link').first()).toHaveText(
    'Pre-flight check',
  );
  await expect(systems.getByRole('link').first()).toHaveAttribute(
    'href',
    '/next/#pre-flight',
  );
  await expect(systems.getByRole('link', { name: 'Scopes' })).toHaveAttribute(
    'href',
    '/next/scopes/',
  );
  const legal = page.locator('.nexus-footer__legal');
  await expect(legal).toContainText('MIT license');
  await expect(legal.getByRole('link', { name: 'GitHub' })).toBeVisible();
  await expect(legal.getByRole('link', { name: 'npm' })).toBeVisible();
  await expect(page.getByText('Pause background')).toHaveCount(0);
});

test('a concept page shows the prerequisites plate above its first H2', async ({
  page,
}) => {
  await page.goto('/next/scopes/');
  const plate = page.getByRole('complementary', { name: 'Before this page' });
  await expect(plate).toBeVisible();
  await expect(
    plate.getByRole('link', { name: 'Modules', exact: true }),
  ).toBeVisible();
  const before = await page.evaluate(() => {
    const aside = document.querySelector('.nexus-prereq');
    const h2 = document.querySelector('article main h2');
    return Boolean(
      aside &&
      h2 &&
      aside.compareDocumentPosition(h2) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(before).toBe(true);
});

test('the current sidebar entry has the edge bar and weight 600', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/next/scopes/');
  const current = page.locator('.nextra-sidebar li.active > a').first();
  await expect(current).toHaveCSS('font-weight', '600');
  const bar = await current.evaluate((link) => {
    const after = getComputedStyle(link, '::before');
    return { width: after.width, content: after.content };
  });
  expect(bar.width).toBe('2px');
});

test('the table of contents shows at 1280 px and hides below', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/next/scopes/');
  await expect(page.locator('.nextra-toc')).toBeVisible();
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(page.locator('.nextra-toc')).toBeHidden();
});

test('the skip link is the focusable and reaches the article', async ({
  page,
}) => {
  await page.goto('/next/scopes/');
  const skip = page.locator('.nextra-skip-nav');
  // WebKit on macOS leaves links out of the tab order unless the system
  // asks for it, so the link is focused directly and its place is checked.
  await skip.focus();
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#nextra-skip-nav$/);
});

test('a region fence shows its file name in a placard', async ({ page }) => {
  await page.goto('/next/scopes/');
  await expect(page.locator('.nexus-source__head').first()).toBeVisible();
  await expect(page.locator('.nexus-source__file').first()).toContainText(
    '.md',
  );
});

test('a code page weights its H1 for search and every page carries its band', async ({
  request,
}) => {
  const code = await (
    await request.get('/next/errors/NEXUS_AMBIGUOUS_PROVIDER/')
  ).text();
  expect(code).toMatch(/<h1[^>]*data-pagefind-weight="10"/);
  expect(code).toMatch(/data-pagefind-filter="band\[data-band\]"/);
  const concept = await (await request.get('/next/scopes/')).text();
  expect(concept).not.toMatch(/<h1[^>]*data-pagefind-weight/);
  expect(concept).toContain('data-band="Concepts"');
});

test('search opens its results on a plate with a band placard per page', async ({
  page,
}) => {
  await page.goto('/next/');
  await page.locator('input[type="search"]').first().fill('identity');
  const panel = page.locator('.nexus-search__panel').first();
  await expect(panel.getByRole('option').first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(panel.locator('.nexus-search__band').first()).toBeVisible();
});

test('search puts a code page first for its code', async ({ page }) => {
  await page.goto('/next/');
  await page
    .locator('input[type="search"]')
    .first()
    .fill('NEXUS_AMBIGUOUS_PROVIDER');
  const first = page.getByRole('option').first();
  await expect(first).toBeVisible({ timeout: 15_000 });
  await expect(first).toHaveAttribute(
    'href',
    /\/next\/errors\/NEXUS_AMBIGUOUS_PROVIDER\//,
  );
});

test('search takes focus on the slash key, clears on Escape and then lets go', async ({
  page,
}) => {
  await page.goto('/next/scopes/');
  const input = page.locator('input[type="search"]').first();
  await page.keyboard.press('/');
  await expect(input).toBeFocused();
  await page.keyboard.type('scope');
  await page.keyboard.press('Escape');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(input).not.toBeFocused();
});

test('the page reflows at 320 px with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of [
    '/next/scopes/',
    '/next/api/',
    '/next/errors/NEXUS_AMBIGUOUS_PROVIDER/',
  ]) {
    await page.goto(path);
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll, path).toBeLessThanOrEqual(client);
  }
});
