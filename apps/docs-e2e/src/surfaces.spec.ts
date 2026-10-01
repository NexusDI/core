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

for (const path of PAGES) {
  test(`every text node on ${path} sits on a surface of at least 0.86 alpha in dark mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(path);
    await expect(page.locator('html')).toHaveClass(/dark/);

    const bare = await page.evaluate(() => {
      const alphaOf = (value: string): number => {
        if (value === 'transparent') return 0;
        const match = /rgba?\(([^)]+)\)/.exec(value);
        if (!match) return 1;
        const parts = match[1]!.split(/[\s,/]+/).filter(Boolean);
        return parts.length === 4 ? Number(parts[3]) : 1;
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
        let surface: Element | null = element;
        let alpha = 0;
        while (surface && surface !== document.documentElement) {
          alpha = alphaOf(getComputedStyle(surface).backgroundColor);
          if (alpha > 0) break;
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
