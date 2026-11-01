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
      'check() passed: the wiring is right.',
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

  /** The boxes of the room layer, the glyphs, the hint and the transient notes and callouts. */
  async function roomGeometry(page: Page) {
    return page.evaluate(() => {
      type Box = { name: string; x: number; y: number; w: number; h: number };
      const rect = (el: Element, name: string): Box => {
        const r = el.getBoundingClientRect();
        return { name, x: r.left, y: r.top, w: r.width, h: r.height };
      };
      const named = (selector: string, name: (el: Element) => string) =>
        [...document.querySelectorAll(selector)].map((el) =>
          rect(el, name(el)),
        );
      const labels = named(
        '[data-room-label]',
        (el) => el.getAttribute('data-room-label') ?? '',
      );
      // The hit circle is 24 px with a fine pointer; Firefox reports a larger
      // box for the SVG circle, so the centre that each engine reports stands for it.
      const glyphs = named(
        '.nexus-bay__wide [data-bay-part] .bay-hit',
        (el) =>
          el.closest('[data-bay-part]')?.getAttribute('data-bay-part') ?? '',
      ).map((r) => ({
        ...r,
        x: r.x + r.w / 2 - 12,
        y: r.y + r.h / 2 - 12,
        w: 24,
        h: 24,
      }));
      const hint = named('.nexus-bay__hint', () => 'hint');
      const transient = [
        ...named('.nexus-bay__wide .nexus-bay__note', () => 'note'),
        ...named('.nexus-bay__wide .nexus-bay__callout', () => 'callout'),
      ];
      const clipped = [...document.querySelectorAll('[data-room-label]')]
        .filter((el) =>
          [el, ...el.children].some((c) => c.scrollWidth > c.clientWidth + 1),
        )
        .map((el) => el.getAttribute('data-room-label'));
      const svg = document.querySelector('.nexus-bay__leaders');
      const frame = svg?.getBoundingClientRect();
      const leaders =
        svg && frame
          ? [...svg.querySelectorAll('polyline')].map((line) =>
              (line.getAttribute('points') ?? '')
                .split(' ')
                .map((pair) => pair.split(',').map(Number) as [number, number])
                // The leaders draw in the frame `-5 0 80 20`.
                .map(
                  ([x, y]) =>
                    [
                      frame.left + ((x + 5) / 80) * frame.width,
                      frame.top + (y / 20) * frame.height,
                    ] as [number, number],
                ),
            )
          : [];
      return {
        mode:
          document
            .querySelector('.nexus-bay__rooms')
            ?.getAttribute('data-mode') ?? null,
        captions: document.querySelector('.nexus-bay__room-captions') !== null,
        labels,
        glyphs,
        hint: hint[0] ?? null,
        transient,
        clipped,
        leaders,
      };
    });
  }

  /** The plates and leaders that show (not faded out) under a visible callout, note or placard. */
  async function visibleUnderCallouts(page: Page) {
    return page.evaluate(() => {
      const covers = [
        ...document.querySelectorAll(
          '.nexus-bay__wide .nexus-bay__callout, .nexus-bay__wide .nexus-bay__note, .nexus-bay__wide .nexus-bay__placard',
        ),
      ].map((el) => el.getBoundingClientRect());
      const shows = (el: Element) =>
        Number(getComputedStyle(el).opacity) > 0.05;
      const plates = [...document.querySelectorAll('[data-room-label]')]
        .filter((el) => shows(el))
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return covers.some(
            (c) =>
              b.left < c.right &&
              c.left < b.right &&
              b.top < c.bottom &&
              c.top < b.bottom,
          );
        })
        .map((el) => el.getAttribute('data-room-label'));
      const frame = document
        .querySelector('.nexus-bay__leaders')
        ?.getBoundingClientRect();
      const leaders = frame
        ? [...document.querySelectorAll('[data-leader]')]
            .filter((el) => shows(el))
            .filter((el) => {
              const pts = (el.getAttribute('points') ?? '')
                .split(' ')
                .map((pair) => pair.split(',').map(Number));
              return Array.from({ length: 41 }, (_, i) => i / 40).some((t) => {
                const [a, b] = [pts[0] ?? [0, 0], pts[1] ?? [0, 0]];
                const x =
                  frame.left +
                  (((a[0] ?? 0) + ((b[0] ?? 0) - (a[0] ?? 0)) * t + 5) / 80) *
                    frame.width;
                const y =
                  frame.top +
                  (((a[1] ?? 0) + ((b[1] ?? 0) - (a[1] ?? 0)) * t) / 20) *
                    frame.height;
                return covers.some(
                  (c) =>
                    x >= c.left && x <= c.right && y >= c.top && y <= c.bottom,
                );
              });
            })
            .map((el) => `leader ${el.getAttribute('data-leader')}`)
        : [];
      return [...plates, ...leaders];
    });
  }

  /** The plates that are faded out. */
  async function hiddenPlates(page: Page) {
    return page.evaluate(() =>
      [...document.querySelectorAll('[data-room-label], [data-leader]')]
        .filter((el) => Number(getComputedStyle(el).opacity) < 0.95)
        .map(
          (el) =>
            el.getAttribute('data-room-label') ??
            el.getAttribute('data-leader'),
        ),
    );
  }

  type Geometry = Awaited<ReturnType<typeof roomGeometry>>;
  type B = Geometry['labels'][number];
  const overlaps = (a: B, b: B) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const crosses = (seg: [number, number][], box: B) => {
    const [from, to] = seg as [[number, number], [number, number]];
    for (let i = 0; i <= 100; i++) {
      const x = from[0] + ((to[0] - from[0]) * i) / 100;
      const y = from[1] + ((to[1] - from[1]) * i) / 100;
      if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h)
        return true;
    }
    return false;
  };
  /** Checks the plates and leaders against everything they may not cover. */
  function expectClean(found: Geometry, withTransient: boolean) {
    const avoid = [
      ...found.glyphs,
      ...(found.hint ? [found.hint] : []),
      ...(withTransient ? found.transient : []),
    ];
    expect(found.clipped, 'plates whose text is clipped').toEqual([]);
    for (const [i, label] of found.labels.entries()) {
      for (const other of found.labels.slice(i + 1))
        expect(overlaps(label, other), `${label.name} ${other.name}`).toBe(
          false,
        );
      for (const box of avoid)
        expect(overlaps(label, box), `${label.name} over ${box.name}`).toBe(
          false,
        );
    }
    for (const leader of found.leaders)
      for (const box of [...found.glyphs, ...(found.hint ? [found.hint] : [])])
        expect(
          crosses(leader, box),
          `leader ${JSON.stringify(leader)} over ${box.name}`,
        ).toBe(false);
  }

  // The stage is the viewport less 96 px, up to 1344.
  for (const viewport of [640, 736, 864, 996, 1120, 1280, 1440]) {
    test(`the ship names its rooms at a ${viewport} px viewport: clean plates or captions`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport, height: 900 });
      await openBay(page);
      const rooms = page.locator('.nexus-bay__rooms');
      await expect(page.locator('.nexus-bay__legend')).not.toContainText(
        'Painted pipes',
      );
      await expect(page.locator('.nexus-bay__hint')).toBeVisible();
      // The idle hint stays inside the stage whatever its width.
      const inside = await page.evaluate(() => {
        const hint = document
          .querySelector('.nexus-bay__hint')
          ?.getBoundingClientRect();
        const stage = document
          .querySelector('.nexus-bay__wide')
          ?.getBoundingClientRect();
        return hint && stage
          ? { left: hint.left - stage.left, right: stage.right - hint.right }
          : null;
      });
      expect(
        inside?.left,
        'hint clear of the left edge',
      ).toBeGreaterThanOrEqual(0);
      expect(
        inside?.right,
        'hint clear of the right edge',
      ).toBeGreaterThanOrEqual(0);
      const found = await roomGeometry(page);
      if (found.mode === 'callouts') {
        expect(found.captions).toBe(false);
        await expect(rooms).toHaveAttribute('aria-hidden', 'true');
        await expect(rooms).toHaveCSS('pointer-events', 'none');
        expect(found.labels).toHaveLength(7);
        expectClean(found, false);
        await expect(
          rooms.getByText('Engineering (module), ReactorCore (provider)'),
        ).toBeVisible();
      } else {
        // No plate is drawn: the rooms are named in a line under the ship.
        expect(found.labels).toHaveLength(0);
        expect(found.captions).toBe(true);
        await expect(page.locator('.nexus-bay__room-captions')).toBeVisible();
      }
      if (viewport >= 1280) expect(found.mode).toBe('callouts');
      // A press on a glyph still goes through the layer. Below 1000 px the
      // rings of neighbouring parts already overlap, so only a desktop presses.
      if (viewport >= 1280) {
        await press(page, 'conduit-Tactical-Comms');
        await expect(page.locator('.nexus-bay__alert')).toBeVisible();
      }
    });
  }

  for (const width of [1440, 1280]) {
    test(`with a conduit cut or a system offline at ${width}, no plate covers a note`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await openBay(page);
      for (const part of [
        'conduit-Tactical-Comms',
        'conduit-Tactical-Engineering',
        'system-ShipComputer',
        'hatch-ShipComputer',
      ]) {
        await press(page, part);
        await expect(page.locator('.nexus-bay__alert')).toBeVisible();
        const found = await roomGeometry(page);
        for (const label of found.labels)
          for (const box of found.transient.filter((b) => b.name === 'note'))
            expect(
              overlaps(label, box),
              `${part}: ${label.name} over a ${box.name}`,
            ).toBe(false);
        // A callout, which the press caused, wins: no plate or leader that it
        // covers stays visible while it shows.
        await expect
          .poll(() => visibleUnderCallouts(page), { message: part })
          .toEqual([]);
        await page.getByRole('button', { name: 'Reset' }).click();
        await expect(page.locator('.nexus-bay__alert')).toBeHidden();
        // The plates and leaders return when the alarm clears.
        await expect.poll(() => hiddenPlates(page)).toEqual([]);
      }
    });
  }

  // Owner ruling OR2: the whole bay fits one 1440x900 viewport, whatever it shows.
  const OR2_STATES: [string, (page: Page) => Promise<void>][] = [
    ['rest', async () => undefined],
    [
      'cut',
      async (page) => {
        await press(page, 'conduit-Tactical-Comms');
        await expect(terminal(page)).toContainText('exit 1');
      },
    ],
    [
      'unpowered',
      async (page) => {
        await press(page, 'system-ShipComputer');
        await expect(terminal(page)).toContainText('exit 1');
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
        await expect(launch(page)).toHaveText(/Relaunch/);
      },
    ],
  ];
  for (const [state, act] of OR2_STATES) {
    test(`OR2: the ${state} state fits 1440x900`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openBay(page);
      await act(page);
      // The bay sits just under the navbar, as a visitor leaves it.
      await page.evaluate(() => {
        const bay = document.querySelector('#pre-flight');
        if (bay)
          window.scrollTo(
            0,
            bay.getBoundingClientRect().top + window.scrollY - 72,
          );
      });
      const bottoms = await page.evaluate(() => {
        const bottom = (selector: string) =>
          document.querySelector(selector)?.getBoundingClientRect().bottom ??
          null;
        const log = document.querySelector('[role="log"]');
        return {
          body: bottom('.nexus-bay__body'),
          terminal: log?.getBoundingClientRect().bottom ?? null,
          launch: bottom('.nexus-bay__launch'),
          button: bottom('#bay-launch'),
          caption: bottom('.nexus-bay__caption'),
          side: bottom('.nexus-bay__side'),
        };
      });
      for (const [name, value] of Object.entries(bottoms))
        if (value !== null)
          expect(value, `${state}: bottom of ${name}`).toBeLessThanOrEqual(900);
    });
  }

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
    // A run's canvas holds the crop of a frame: at least one of its pixels is opaque.
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

  test('a wide screen lights the stage whatever memory the browser reports', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'The software GL of Chromium is the reference.',
    );
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'deviceMemory', { value: 2 });
    });
    await openBay(page);
    await expect(light(page)).toHaveAttribute('data-light', 'on', {
      timeout: 30_000,
    });
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
    { name: '1024', width: 1024, height: 900 },
    { name: '640', width: 640, height: 900 },
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
        // 1024 guards the lit art at a stage that is not 1344 wide, and 640 the
        // hint above the hull: one baseline each.
        if (
          (size.name === '1024' || size.name === '640') &&
          (theme !== 'dark' || state !== 'rest')
        )
          continue;
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
