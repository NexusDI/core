import { expect, test } from '@playwright/test';

const PAGES = ['/next/', '/next/tokens/'];

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
    test(`every text node on ${path} sits on a surface of at least 0.86 alpha in ${theme} mode`, async ({
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
          if (comma) return Number(comma[1]!.split(',')[3] ?? 1);
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
          // behind it, so the walk continues past a partial alpha.
          let surface: Element | null = element;
          let alpha = 0;
          while (surface && surface !== document.documentElement) {
            alpha = alphaOf(getComputedStyle(surface).backgroundColor);
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
  test(`html paints the ground gradient in ${theme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/next/');
    const image = await page.evaluate(
      () => getComputedStyle(document.documentElement).backgroundImage,
    );
    expect(image).toContain('linear-gradient');
  });
}
