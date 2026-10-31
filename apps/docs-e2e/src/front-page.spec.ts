import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * The front page's pre-flight bay (site UX spec 12.5). Every click on the ship
 * performs one real core operation in the browser, and these tests hold the
 * codes it shows against the fixtures that `docs:scene-fixtures` wrote by
 * running the same operation in Node.
 */

interface FixtureError {
  code: string;
  entries?: FixtureError[];
  cause?: { message: string };
}
interface Fixture {
  check: { withErrors: { ok: boolean; error: FixtureError | null } };
  launch: {
    ok: boolean;
    error: FixtureError | null;
    lookup: { error: FixtureError } | null;
  } | null;
}

function fixture(id: string): Fixture {
  return JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        '..',
        '..',
        'docs',
        'components',
        'front-page',
        'fixtures',
        `${id}.json`,
      ),
      'utf8',
    ),
  ) as Fixture;
}

function codesOf(id: string): string[] {
  const { error } = fixture(id).check.withErrors;
  if (!error) return [];
  return (error.entries ?? [error]).map((entry) => entry.code);
}

/** Opens the front page on its final state, with no autoplay, once the controller is live. */
async function openBay(page: Page, query = '?power=final'): Promise<void> {
  await page.goto(`/next/${query}`);
  await page.locator('[data-bay="live"]').waitFor({ state: 'attached' });
  await page.locator('#pre-flight').scrollIntoViewIfNeeded();
}

/** Presses one part of the ship, the way a pointer does: on its hit circle. */
async function press(page: Page, part: string): Promise<void> {
  await page.locator(`[data-bay-part="${part}"] .bay-hit`).click();
}

const terminal = (page: Page) =>
  page.getByRole('log', { name: 'preflight.ts' });
/** The polite live region of the bay. */
const status = (page: Page) =>
  page.locator('.nexus-bay__body > [role="status"]');
const graphSwitch = (page: Page) =>
  page.locator('label.meridian-switch', { hasText: 'Show the graph' });
const launch = (page: Page) =>
  page.getByRole('button', { name: /Launch|Relaunch/ });

const CLICKS = [
  { part: 'conduit-Tactical-Comms', fixture: 'cut-comms' },
  { part: 'conduit-Tactical-Engineering', fixture: 'cut-engineering' },
  { part: 'system-ShipComputer', fixture: 'offline-computer' },
  { part: 'hatch-ShipComputer', fixture: 'hatch-computer' },
] as const;

test.describe('the pre-flight bay', () => {
  for (const { part, fixture: id } of CLICKS) {
    test(`pressing ${part} gives the codes of ${id}, and Reset passes`, async ({
      page,
    }) => {
      await openBay(page);
      await press(page, part);
      const codes = codesOf(id);
      expect(codes.length).toBeGreaterThan(0);
      const banner = page.locator('.nexus-bay__alert');
      await expect(banner).toContainText(codes[0] as string);
      for (const code of codes)
        await expect(terminal(page)).toContainText(code);
      await expect(terminal(page)).toContainText('exit 1');
      await page.getByRole('button', { name: 'Reset' }).click();
      await expect(banner).toBeHidden();
      await expect(terminal(page)).toContainText('pre-flight ok');
      await expect(launch(page)).not.toHaveAttribute('aria-disabled', 'true');
    });
  }

  test('cutting both conduits lists every entry in one error', async ({
    page,
  }) => {
    await openBay(page);
    await press(page, 'conduit-Tactical-Comms');
    await press(page, 'conduit-Tactical-Engineering');
    const codes = codesOf('cut-both');
    await expect(page.locator('.nexus-bay__alert')).toContainText(
      `${codes.length} errors`,
    );
  });

  test('Launch locks while the check fails and unlocks after the fix', async ({
    page,
  }) => {
    await openBay(page);
    await press(page, 'conduit-Tactical-Comms');
    const button = launch(page);
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAccessibleDescription(
      'Launch is locked until the check passes',
    );
    await page.getByRole('button', { name: 'Apply the fix' }).click();
    await expect(button).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('.nexus-bay__alert')).toBeHidden();
    await expect(status(page)).toHaveText('Check passed');
  });

  test('the COMPUTER hatch gives NEXUS_MISSING_PROVIDER and locks Launch', async ({
    page,
  }) => {
    await openBay(page);
    await press(page, 'hatch-ShipComputer');
    await expect(page.locator('.nexus-bay__alert')).toContainText(
      'NEXUS_MISSING_PROVIDER',
    );
    await expect(launch(page)).toHaveAttribute('aria-disabled', 'true');
  });

  test('the DRONE hatch passes the check, and after Launch the readout gives NEXUS_NOT_VISIBLE', async ({
    page,
  }) => {
    await openBay(page);
    await press(page, 'hatch-SurveyDrone');
    expect(fixture('hatch-drone').check.withErrors.ok).toBe(true);
    await expect(status(page)).toHaveText('Check passed');
    await launch(page).click();
    const code = fixture('hatch-drone').launch?.lookup?.error.code as string;
    await expect(terminal(page)).toContainText(code, { timeout: 10_000 });
    await expect(page.locator('.nexus-bay__alert')).toContainText(code);
    await expect(page.locator('.nexus-bay__caption')).toContainText(
      "The wiring passed. The bridge's lookup is your own code",
    );
  });

  test('the chart server link passes the check and fails the launch', async ({
    page,
  }) => {
    await openBay(page);
    await press(page, 'chart-server');
    await expect(status(page)).toHaveText('Check passed');
    await launch(page).click();
    const failed = fixture('chart-server-down').launch?.error;
    await expect(terminal(page)).toContainText(failed?.code as string, {
      timeout: 10_000,
    });
    await expect(terminal(page)).toContainText(
      failed?.cause?.message as string,
    );
    await expect(page.locator('.nexus-bay__caption')).toContainText(
      'Nexus.check passed: the wiring is right.',
    );
    // The launch can run again after the failed one: Relaunch disposes first.
    await page.getByRole('button', { name: 'Reset' }).click();
    await launch(page).click();
    await expect(terminal(page)).toContainText('Ready in', { timeout: 10_000 });
  });

  test('a launch lights the ship in levels and lists them in the step list', async ({
    page,
  }) => {
    await openBay(page);
    await launch(page).click();
    await expect(terminal(page)).toContainText('Ready in', { timeout: 10_000 });
    await expect(page.locator('.meridian-steps')).toContainText(
      'Level 1. Reactor and subspace link online.',
    );
    await expect(terminal(page)).toContainText('Kepler-442b');
  });

  test('Tab reaches the hotspots in hull order', async ({ page }) => {
    await openBay(page);
    const order: number[] = [];
    await page.locator('[data-bay-part]').first().focus();
    for (let at = 0; at < 19; at++) {
      const x = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        const hit = active?.querySelector('.bay-hit');
        return active?.dataset['bayPart'] && hit
          ? Number(hit.getAttribute('cx'))
          : null;
      });
      expect(x, `stop ${at}`).not.toBeNull();
      order.push(x as number);
      await page.keyboard.press('Tab');
    }
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(19);
  });

  test('a focused switch outlines its part on the ship, and Focus never moves on its own', async ({
    page,
  }) => {
    await openBay(page);
    await page.getByText('Systems', { exact: false }).first().click();
    const first = page.locator('.nexus-bay__switches input').first();
    await first.focus();
    await expect(page.locator('.bay-part.is-outlined')).toHaveCount(1);
    await first.press('Space');
    await expect(first).toBeFocused();
  });

  test('Show the graph draws edges and leaves the ship alone', async ({
    page,
  }) => {
    await openBay(page);
    await graphSwitch(page).click();
    await expect(page.locator('.bay-graph path').first()).toBeVisible();
    await expect(page.locator('.nexus-bay__alert')).toBeHidden();
    await expect(status(page)).not.toHaveText(/failed/);
  });
});

test.describe('the bay without script or motion', () => {
  test('with JavaScript off, the bay shows pre-flight ok and no control', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/next/');
    const bay = page.locator('#pre-flight');
    await expect(bay).toContainText('pre-flight ok');
    await expect(bay).toContainText(
      'The pre-flight check runs in your browser with JavaScript.',
    );
    await expect(bay.getByRole('button')).toHaveCount(0);
    await expect(bay.getByRole('switch')).toHaveCount(0);
    await expect(bay.locator('input')).toHaveCount(0);
    await context.close();
  });

  test('under reduced motion, the final state shows at once', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/next/');
    await page.locator('[data-bay="live"]').waitFor({ state: 'attached' });
    const css = await page
      .locator('.nexus-bay__stage style')
      .first()
      .evaluate((element) => element.textContent);
    expect(css).toContain(
      '[data-room="bridge"]{fill:var(--meridian-sv-room-powered)}',
    );
    await launch(page).click();
    await expect(terminal(page)).toContainText('Ready in', { timeout: 10_000 });
    await expect(page.locator('.meridian-steps')).toContainText('Level 3.');
  });
});

test.describe('the lit scene', () => {
  const light = (page: Page) => page.locator('[data-light]');

  test('with WebGL the deck view lights the stage and the tints drop away', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'The software GL of Chromium is the reference.',
    );
    await openBay(page);
    await expect(light(page)).toHaveAttribute('data-light', 'on', {
      timeout: 30_000,
    });
    await expect(page.locator('.meridian-schematic--lit')).toHaveCount(1);
    await expect(page.locator('.nexus-bay__canvas')).toBeVisible();
    // A fault still reads on the lit ship: the alarm outline and the banner stay.
    await press(page, 'conduit-Tactical-Comms');
    await expect(page.locator('.nexus-bay__alert')).toContainText(
      'NEXUS_MISSING_PROVIDER',
    );
  });

  test('without WebGL the page keeps the tints and every control works', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        kind: string,
        ...rest: unknown[]
      ) {
        if (kind === 'webgl2' || kind === 'webgl') return null;
        return (original as (...args: unknown[]) => unknown).call(
          this,
          kind,
          ...rest,
        );
      } as typeof original;
    });
    await openBay(page);
    await press(page, 'conduit-Tactical-Comms');
    await expect(page.locator('.nexus-bay__alert')).toContainText(
      'NEXUS_MISSING_PROVIDER',
    );
    await expect(light(page)).toHaveAttribute('data-light', 'off');
    await expect(page.locator('.meridian-schematic--lit')).toHaveCount(0);
    await expect(page.locator('.nexus-bay__canvas')).toHaveCSS('opacity', '0');
  });

  test('a reader who saves data keeps the tints', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        value: { saveData: true },
      });
    });
    await openBay(page);
    await press(page, 'conduit-Tactical-Comms');
    await expect(light(page)).toHaveAttribute('data-light', 'off');
    await expect(page.locator('.meridian-schematic--lit')).toHaveCount(0);
  });

  test('a phone shows the lit scene on a 2D canvas for each run of the section', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'The software GL of Chromium is the reference.',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await openBay(page);
    await expect(light(page)).toHaveAttribute('data-light', 'on', {
      timeout: 30_000,
    });
    await expect(page.locator('.meridian-schematic--lit')).toHaveCount(2);
    const canvases = page.locator('.nexus-bay__phone canvas.nexus-bay__canvas');
    await expect(canvases).toHaveCount(2);
    // A run's canvas holds the crop of a frame, not a blank: some pixel is not clear.
    const painted = await canvases.first().evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const data = canvas
        .getContext('2d')
        ?.getImageData(0, 0, canvas.width, canvas.height).data;
      return data ? data.some((value, at) => at % 4 === 3 && value > 0) : false;
    });
    expect(painted).toBe(true);
    // Another section paints from the last frame, with no frame of its own.
    await page.getByRole('tab', { name: 'Comms' }).click();
    const comms = page.locator('.nexus-bay__phone canvas.nexus-bay__canvas');
    await expect(comms).toHaveCount(1);
    const again = await comms.first().evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const data = canvas
        .getContext('2d')
        ?.getImageData(0, 0, canvas.width, canvas.height).data;
      return data ? data.some((value, at) => at % 4 === 3 && value > 0) : false;
    });
    expect(again).toBe(true);
  });

  test('a phone with less than 4 GB of memory keeps the tints', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'deviceMemory', { value: 2 });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await openBay(page);
    await expect(light(page)).toHaveAttribute('data-light', 'off');
    await expect(page.locator('.meridian-schematic--lit')).toHaveCount(0);
  });
});

test.describe('the front page vitals', () => {
  async function vitals(page: Page) {
    await page.addInitScript(() => {
      const w = window as unknown as {
        __lcp: string;
        __cls: number;
      };
      w.__lcp = '';
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const element = (entry as PerformanceEntry & { element?: Element })
            .element;
          w.__lcp = element
            ? `${element.tagName.toLowerCase()}:${element.closest('.nexus-hero__art') ? 'hero-art' : (element.className ?? '')}`
            : '';
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
          };
          if (!shift.hadRecentInput) w.__cls += shift.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/next/');
    await page.locator('[data-bay="live"]').waitFor({ state: 'attached' });
    await page.locator('#pre-flight').scrollIntoViewIfNeeded();
    // The power-up plays here, once the run chunk and the controller have arrived.
    await expect(terminal(page)).toContainText('Ready in', { timeout: 15_000 });
    return page.evaluate(() => {
      const w = window as unknown as { __lcp: string; __cls: number };
      return { lcp: w.__lcp, cls: w.__cls };
    });
  }

  test('on a wide screen the LCP element is the hero art and nothing shifts', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Only Chromium reports these entries.',
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    const { lcp, cls } = await vitals(page);
    expect(lcp).toBe('img:hero-art');
    expect(cls).toBeLessThan(0.01);
  });

  test('on a phone the LCP element is in the hero, never the bay, and nothing shifts', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Only Chromium reports these entries.',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    const { lcp, cls } = await vitals(page);
    // The headline or the stacked hero art, whichever paints the larger area.
    expect(lcp === 'img:hero-art' || lcp.startsWith('h1:')).toBe(true);
    expect(cls).toBeLessThan(0.01);
  });
});

/**
 * Visual baselines (site UX spec 12.4), Chromium only: the bay at rest, after
 * a cut conduit, after a failed startup and with the overlay on, at 1440 and
 * 390 pixels in both themes. `?power=final` opens the bay on its final state
 * with no autoplay.
 */
test.describe('the bay baselines', () => {
  const SIZES = [
    { name: '1440', width: 1440, height: 900 },
    { name: '390', width: 390, height: 844 },
  ];
  for (const size of SIZES) {
    for (const theme of ['dark', 'light'] as const) {
      const states: [string, (page: Page) => Promise<void>][] = [
        ['rest', async () => undefined],
        [
          'cut',
          async (page) => {
            await press(page, 'conduit-Tactical-Comms');
            await expect(page.locator('.nexus-bay__alert')).toBeVisible();
          },
        ],
        [
          'failed-startup',
          async (page) => {
            await press(page, 'chart-server');
            await expect(status(page)).toHaveText('Check passed');
            await launch(page).click();
            await expect(page.locator('.nexus-bay__caption')).toBeVisible({
              timeout: 10_000,
            });
          },
        ],
        [
          'overlay',
          async (page) => {
            await graphSwitch(page).click();
            await expect(page.locator('.bay-graph path').first()).toBeVisible();
          },
        ],
      ];
      for (const [state, act] of states) {
        test(`${state} at ${size.name} in ${theme} mode`, async ({
          page,
          browserName,
        }) => {
          test.skip(
            browserName !== 'chromium' || process.platform !== 'linux',
            'The baselines are drawn in the Linux image, in Chromium.',
          );
          await page.setViewportSize({
            width: size.width,
            height: size.height,
          });
          await page.emulateMedia({
            colorScheme: theme,
            reducedMotion: 'reduce',
          });
          await openBay(page);
          // The lit scene is part of every baseline.
          await expect(page.locator('[data-light]')).toHaveAttribute(
            'data-light',
            'on',
            { timeout: 30_000 },
          );
          await act(page);
          await page.evaluate(() => document.fonts.ready);
          // Put the bay just under the navbar, so the sticky alert band sits
          // at its own place in the frame.
          await page.evaluate(() => {
            const bay = document.querySelector('#pre-flight');
            if (bay)
              window.scrollTo(
                0,
                bay.getBoundingClientRect().top + window.scrollY - 72,
              );
          });
          await expect(page.locator('#pre-flight')).toHaveScreenshot(
            `bay-${state}-${size.name}-${theme}.png`,
            { animations: 'disabled', maxDiffPixelRatio: 0.02 },
          );
        });
      }
    }
  }
});
