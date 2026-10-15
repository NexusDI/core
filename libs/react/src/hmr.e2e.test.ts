import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { chromium, type Browser, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

// The copy sits under libs/react/tmp (gitignored), so its imports resolve
// through the workspace's node_modules, and the test edits it freely.
const TMP = join(import.meta.dirname, '..', 'tmp');

let dir: string;
let server: ViteDevServer;
let browser: Browser;
let page: Page;
let loads = 0;
const messages: string[] = [];

const edit = (file: string, from: string, to: string) => {
  const path = join(dir, file);
  const text = readFileSync(path, 'utf8');
  if (!text.includes(from)) throw new Error(`${file} holds no '${from}'`);
  writeFileSync(path, text.replace(from, to));
};
const text = (selector: string) => page.textContent(selector);
const errors = () =>
  messages.filter((m) => /NEXUS_[A-Z_]+|Error/.test(m)).join('\n');

beforeAll(async () => {
  mkdirSync(TMP, { recursive: true });
  dir = mkdtempSync(join(TMP, 'hmr-'));
  cpSync(join(import.meta.dirname, '..', 'test-fixtures', 'hmr'), dir, {
    recursive: true,
  });
  server = await createServer({
    root: dir,
    configFile: join(dir, 'vite.config.ts'),
    logLevel: 'silent',
    // Polling: fsevents reports the copy's own writes late and can miss
    // the test's edit that follows them.
    server: { port: 0, watch: { usePolling: true, interval: 50 } },
  });
  await server.listen();
  browser = await chromium.launch();
  page = await browser.newPage();
  page.on('console', (m) => messages.push(m.text()));
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('load', () => (loads += 1));
  await page.goto(server.resolvedUrls?.local[0] ?? '');
  await page.waitForSelector('#heading');
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

it('swaps the container on a service edit, with no NEXUS_DISPOSED', async () => {
  expect(await text('#log')).toBe('log v1');
  edit('src/flight-log.ts', 'log v1', 'log v2');
  await page.waitForFunction(
    () => document.querySelector('#log')?.textContent === 'log v2',
  );
  // The section loads again into the new container.
  await page.waitForSelector('#heading');
  await page.waitForTimeout(100); // past the deferred release of the old container
  expect(await text('#heading')).toBe('heading 42');
  expect(loads).toBe(1);
  expect(errors()).toBe('');
});

// react spec 12.2. app.tsx is a Fast Refresh boundary and renders with the
// new tokens at once, while main.tsx still awaits the new container. That
// render reads the old container and throws NEXUS_MISSING_PROVIDER; the swap
// then renders both values, the section imported again with the new tokens.
// The edit also adds the reload line the docs give contracts files.
it('recovers from a contracts edit after the swap, past a NEXUS_MISSING_PROVIDER', async () => {
  edit(
    'src/contracts.ts',
    "export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');",
    "export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');\n\n" +
      'import.meta.hot?.accept(() => location.reload());',
  );
  await vi.waitFor(() =>
    expect(messages).toContain('[vite] hot updated: /src/app.tsx'),
  );
  await page.waitForTimeout(500); // past the swap
  expect(await text('#log')).toBe('log v2');
  expect(await text('#heading')).toBe('heading 42');
  expect(errors()).toMatch(/NEXUS_MISSING_PROVIDER\] token=FlightLog/);
  expect(loads).toBe(1);
});

it('reloads the page once for a contracts edit with the reload line', async () => {
  messages.length = 0;
  edit('src/contracts.ts', "'NavCharts'", "'NavCharts' /* edited */");
  await vi.waitFor(() => expect(loads).toBe(2), { timeout: 10_000 });
  await page.waitForSelector('#heading');
  expect(await text('#log')).toBe('log v2');
  expect(errors()).toBe('');
});

it('reloads the page once for an edit of a section module', async () => {
  const before = loads;
  edit('src/sections/navigation.ts', 'return 42;', 'return 43;');
  await page.waitForFunction(
    () => document.querySelector('#heading')?.textContent === 'heading 43',
  );
  await page.waitForTimeout(500);
  expect(loads).toBe(before + 1);
  // The development guard of react spec 12.3 asked for the reload.
  expect(messages).toContainEqual(
    expect.stringContaining("section 'navigation' changed"),
  );
  expect(
    await page.evaluate(() => sessionStorage.getItem('nexusdi:section-reload')),
  ).toContain('"section":"navigation"');
  expect(errors()).toBe('');
});
