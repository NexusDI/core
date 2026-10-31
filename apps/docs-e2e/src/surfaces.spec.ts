import { expect, test } from '@playwright/test';

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

      const bare = await page.evaluate(() => {
        const alphaOf = (value: string): number => {
          if (value === 'transparent') return 0;
          const slash = /\/\s*([\d.]+)\s*\)$/.exec(value);
          if (slash) return Number(slash[1]);
          const comma = /^rgba\(([^)]+)\)$/.exec(value);
          if (comma) return Number(comma[1]?.split(',')[3] ?? 1);
          return 1;
        };
        const offenders: string[] = [];
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue;
          const element = node.parentElement;
          if (!element) continue;
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          if (
            box.width === 0 ||
            box.height === 0 ||
            style.visibility === 'hidden'
          )
            continue;
          if (element.closest('[aria-hidden="true"], script, style, noscript'))
            continue;
          // A tint (inline code, the active sidebar link) sits on the surface
          // behind it, so the walk continues past a partial alpha. The walk
          // ends at the root, whose flat bulkhead is the last surface.
          let surface: Element | null = element;
          let alpha = 0;
          while (surface) {
            const computed = getComputedStyle(surface);
            alpha =
              computed.backgroundImage === 'none'
                ? alphaOf(computed.backgroundColor)
                : 0;
            if (alpha >= 0.86) break;
            surface = surface.parentElement;
          }
          if (alpha < 0.86) {
            const name = element.tagName.toLowerCase();
            const cls =
              element.className && typeof element.className === 'string'
                ? `.${element.className.trim().split(/\s+/).join('.')}`
                : '';
            offenders.push(
              `${name}${cls}: "${node.textContent.trim().slice(0, 40)}" (alpha ${alpha})`,
            );
          }
        }
        return offenders;
      });

      expect(bare, 'Each of these renders over the background canvas').toEqual(
        [],
      );
    });
  }
}

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
