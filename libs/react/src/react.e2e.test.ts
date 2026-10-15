import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { TraceEvent } from '@nexusdi/core';
import { chromium, type Browser } from '@playwright/test';
import { createRequestListener } from '@react-router/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The fixture's trace, which nexus.server.ts writes to this global key.
const events = ((globalThis as { ['rr8-fixture.events']?: TraceEvent[] })[
  'rr8-fixture.events'
] ??= []);
const count = (type: string) => events.filter((e) => e.type === type).length;

const RR8 = join(import.meta.dirname, '..', 'test-fixtures', 'rr8');

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => browser?.close());

describe('React Router 8', () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    // The fixture's folder is passed to the CLI, because npx runs in the
    // folder of the nearest package.json, which is libs/react.
    execFileSync('npx', ['react-router', 'build', RR8], {
      cwd: RR8,
      stdio: 'inherit',
    });
    const build = await import(
      pathToFileURL(join(RR8, 'build', 'server', 'index.js')).href
    );
    const app = createRequestListener({ build });
    // The client bundle, which @react-router/serve would send from build/client.
    server = createServer((req, res) => {
      if (!req.url?.startsWith('/assets/')) return void app(req, res);
      // Only a file under build/client: a path that climbs out answers 404.
      const client = resolve(RR8, 'build', 'client');
      const file = resolve(client, `.${req.url.split('?')[0] ?? ''}`);
      if (!file.startsWith(`${client}${sep}`)) {
        res.statusCode = 404;
        return void res.end();
      }
      readFile(file).then(
        (body) => {
          res.setHeader('Content-Type', 'text/javascript');
          res.end(body);
        },
        () => {
          res.statusCode = 404;
          res.end();
        },
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  });
  afterAll(async () => {
    server?.closeAllConnections();
    server?.close();
  });

  it('passes the middleware RouterContextProvider to handleRequest as loadContext', async () => {
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-load-context')).toBe('RouterContextProvider');
  });

  it('renders a request no route matches with no request scope', async () => {
    const created = count('scope:create');
    const res = await fetch(`${url}missing`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('<html lang="en">');
    expect(count('scope:create')).toBe(created);
  });

  it('renders with the request scope and fallbacks for the client-only parts', async () => {
    const html = await (await fetch(url)).text();
    expect(html).toContain('<p id="course">rendered on the server</p>');
    expect(html).toContain('Docking');
    expect(html).toContain('Loading section');
    expect(html).toContain('Console skeleton');
    expect(html).not.toContain('id="docked"');
    expect(html).not.toContain('id="heading"');
    expect(html).not.toContain('id="console"');
  });

  it('hydrates with no NEXUS_SCOPE_REQUIRED, no hydration error and no console error', async () => {
    const page = await browser.newPage();
    const messages: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning')
        messages.push(m.text());
    });
    page.on('pageerror', (e) => messages.push(e.message));
    await page.goto(url);
    await page.waitForSelector('#heading');
    await page.waitForSelector('#docked');
    await page.waitForSelector('#console');
    expect(await page.textContent('#course')).toBe('rendered on the server');
    expect(await page.textContent('#docked')).toBe('rendered on the server');
    expect(await page.textContent('#console')).toBe('rendered on the server');
    expect(await page.textContent('#heading')).toBe('heading 42');
    expect(await page.getByText('Docking').count()).toBe(0);
    expect(await page.getByText('Loading section').count()).toBe(0);
    expect(await page.getByText('Console skeleton').count()).toBe(0);
    expect(messages).toEqual([]);
    await page.close();
  });
});
