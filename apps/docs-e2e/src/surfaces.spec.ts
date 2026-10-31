import { expect, test, type Page } from '@playwright/test';

const PAGES = [
  '/next/',
  '/next/tokens/',
  '/next/api/',
  '/next/api-node/',
  '/next/api-testing/',
  '/next/api-decorators/',
  '/next/api-errors-package/',
  '/next/api-devtools/',
  '/next/api-federation/',
  '/next/api-interceptors/',
];

for (const theme of ['dark', 'light'] as const) {
  test(`body has a transparent background in ${theme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/next/');
    const background = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(background).toBe('rgba(0, 0, 0, 0)');
  });
}

/**
 * Walks up from every text node to the first opaque surface and reports what
 * is wrong between them and at the surface itself:
 *
 * - an element between the text and the surface that paints a background
 *   image, or a colour with an alpha under 0.86 that is not a listed tint;
 * - no opaque surface at all;
 * - a first opaque surface that is none of the design system's surface
 *   colours (bulkhead, plate, plate-raised or screen, in either theme).
 *
 * `TINTS` lists the elements whose partial-alpha background is meant to sit on
 * the surface behind them.
 */
const TINTS: readonly string[] = [];

async function offenders(page: Page): Promise<string[]> {
  return page.evaluate((tints) => {
    const alphaOf = (value: string): number => {
      if (value === 'transparent') return 0;
      const slash = /\/\s*([\d.]+)\s*\)$/.exec(value);
      if (slash) return Number(slash[1]);
      const comma = /^rgba\(([^)]+)\)$/.exec(value);
      if (comma) return Number(comma[1]?.split(',')[3] ?? 1);
      return 1;
    };
    /** `rgb()` strings of the surface roles, read through a probe. */
    const probe = document.createElement('div');
    document.body.append(probe);
    const surfaces = new Set<string>();
    for (const theme of ['dark', 'light'])
      for (const role of ['bulkhead', 'plate', 'plate-raised']) {
        probe.style.background = `var(--meridian-palette-${theme}-${role})`;
        surfaces.add(getComputedStyle(probe).backgroundColor);
      }
    probe.style.background = 'var(--meridian-screen)';
    surfaces.add(getComputedStyle(probe).backgroundColor);
    probe.remove();

    const found: string[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const element = node.parentElement;
      if (!element) continue;
      const box = element.getBoundingClientRect();
      if (
        box.width === 0 ||
        box.height === 0 ||
        getComputedStyle(element).visibility === 'hidden'
      )
        continue;
      if (element.closest('[aria-hidden="true"], script, style, noscript'))
        continue;

      const name = `${element.tagName.toLowerCase()}: "${node.textContent.trim().slice(0, 40)}"`;
      let surface: Element | null = element;
      let problem = '';
      let colour = '';
      while (surface) {
        const style = getComputedStyle(surface);
        const alpha = alphaOf(style.backgroundColor);
        if (style.backgroundImage === 'none' && alpha >= 0.86) {
          colour = style.backgroundColor;
          break;
        }
        const tint = tints.some((selector) => surface?.matches(selector));
        if (style.backgroundImage !== 'none' && !tint)
          problem = `a background image on ${surface.tagName.toLowerCase()}.${String(surface.className).slice(0, 40)}`;
        else if (alpha > 0 && !tint)
          problem = `alpha ${alpha} on ${surface.tagName.toLowerCase()}.${String(surface.className).slice(0, 40)}`;
        surface = surface.parentElement;
      }
      if (!colour) problem ||= 'no opaque surface';
      else if (!surfaces.has(colour) && !problem)
        problem = `the surface ${colour} is no design system surface`;
      if (problem) found.push(`${name} (${problem})`);
    }
    return found;
  }, TINTS);
}

for (const theme of ['dark', 'light'] as const) {
  for (const path of PAGES) {
    test(`every text node on ${path} sits on an opaque surface in ${theme} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(path);
      await expect(page.locator('html')).toHaveClass(
        theme === 'dark' ? /dark/ : /light/,
      );
      expect(
        await offenders(page),
        'Each of these renders over the background canvas',
      ).toEqual([]);
    });
  }
}

test('the surface check fails on a glass plate and on a gradient', async ({
  page,
}) => {
  await page.goto('/next/tokens/');
  await page.addStyleTag({
    content: 'article { background: rgb(20 20 20 / 0.6); }',
  });
  expect((await offenders(page)).some((each) => /alpha 0\.6/.test(each))).toBe(
    true,
  );
  await page.addStyleTag({
    content:
      'article { background: linear-gradient(rgb(10 10 10), rgb(40 40 40)); }',
  });
  expect(
    (await offenders(page)).some((each) => /background image/.test(each)),
  ).toBe(true);
});

for (const theme of ['dark', 'light'] as const) {
  test(`html paints the flat bulkhead in ${theme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/next/');
    const ground = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return { image: style.backgroundImage, colour: style.backgroundColor };
    });
    // The design system has no gradient: the ground is one opaque colour.
    expect(ground.image).toBe('none');
    expect(ground.colour).toMatch(/^rgb\(/);
  });
}

test('colours a case token differently in light and dark mode', async ({
  page,
}) => {
  /** The colour of the first highlighted token in the first case pane. */
  const tokenColour = async (theme: 'dark' | 'light') => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/next/api-node/');
    await expect(page.locator('html')).toHaveClass(
      theme === 'dark' ? /dark/ : /light/,
    );
    await page.locator('.nexus-behaviours').first().scrollIntoViewIfNeeded();
    const token = page
      .locator('.nexus-behaviours__body span[class*="sh-"]')
      .first();
    await expect(token).toBeVisible();
    return token.evaluate((element) => getComputedStyle(element).color);
  };

  const light = await tokenColour('light');
  const dark = await tokenColour('dark');
  expect(light).not.toBe(dark);
});
