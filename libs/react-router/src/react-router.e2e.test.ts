import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { FIXTURE, startFixture } from '../test-support/fixture-server.js';

let fixture: Awaited<ReturnType<typeof startFixture>>;
beforeAll(async () => {
  fixture = await startFixture();
});
afterAll(async () => fixture.close());

const count = (type: string) =>
  fixture.events.filter((e) => e.type === type).length;
const until = async (check: () => boolean) => {
  for (let i = 0; i < 300 && !check(); i++)
    await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
};
const settle = (ms = 50) => new Promise((r) => setTimeout(r, ms));
const decoder = new TextDecoder();
// The default entry.server waits for the whole page when isbot() matches the
// user agent, and undici's "node" matches, so the streaming tests send a
// browser's.
const BROWSER = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
};

describe('@nexusdi/react-router in a built app', () => {
  it('renders a document request whose parallel loaders share one scope', async () => {
    const created = count('scope:create');
    const disposed = count('scope:dispose');
    const html = await (
      await fetch(`${fixture.url}/course/Kepler-442b`)
    ).text();
    expect(html).toContain(
      'survey-7: bridge open | survey-7: course locked | survey-7: plotting Kepler-442b',
    );
    expect(html).not.toContain('NEXUS_DISPOSED');
    await until(() => count('scope:dispose') === disposed + 1);
    expect(count('scope:create')).toBe(created + 1);
  });

  it('serves a .data request through the same middleware', async () => {
    const disposed = count('scope:dispose');
    const res = await fetch(`${fixture.url}/course/Vega.data`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('survey-7: plotting Vega');
    await until(() => count('scope:dispose') === disposed + 1);
  });

  it('serves a resource route and disposes its scope', async () => {
    const disposed = count('scope:dispose');
    const res = await fetch(`${fixture.url}/log.json`);
    expect(await res.json()).toEqual(['survey-7: resource read']);
    await until(() => count('scope:dispose') === disposed + 1);
  });

  it('streams a deferred value after the shell and disposes after the last chunk', async () => {
    const disposed = count('scope:dispose');
    const res = await fetch(`${fixture.url}/course/Altair?delay=200`, {
      headers: BROWSER,
    });
    const reader = res.body?.getReader();
    if (reader === undefined) throw new Error('no body');
    const first = decoder.decode((await reader.read()).value);
    expect(first).not.toContain('course locked');
    await settle();
    expect(count('scope:dispose')).toBe(disposed);
    let rest = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += decoder.decode(value);
    }
    expect(rest).toContain('survey-7: course locked');
    expect(first + rest).not.toContain('NEXUS_DISPOSED');
    await until(() => count('scope:dispose') === disposed + 1);
  });

  it('disposes once when the consumer cancels the stream mid-way', async () => {
    const disposed = count('scope:dispose');
    const res = await fetch(`${fixture.url}/course/Deneb?delay=300`, {
      headers: BROWSER,
    });
    const reader = res.body?.getReader();
    if (reader === undefined) throw new Error('no body');
    const first = decoder.decode((await reader.read()).value);
    await reader.cancel();
    await until(() => count('scope:dispose') === disposed + 1);
    await settle(400);
    expect(count('scope:dispose')).toBe(disposed + 1);
    expect(first).not.toContain('NEXUS_DISPOSED');
  });

  it('disposes the scope when request.signal aborts mid-stream', async () => {
    const disposed = count('scope:dispose');
    const controller = new AbortController();
    const res = await fetch(`${fixture.url}/course/Rigel?delay=300`, {
      headers: BROWSER,
      signal: controller.signal,
    });
    await res.body?.getReader().read();
    controller.abort();
    await until(() => count('scope:dispose') === disposed + 1);
    await settle(400);
    expect(count('scope:dispose')).toBe(disposed + 1);
  });

  it('serves the first request into a lazy route without an ambient scope', async () => {
    const extended = count('scope:extend');
    const html = await (await fetch(`${fixture.url}/nav/kepler`)).text();
    expect(html).toContain('route to kepler');
    expect(count('scope:extend')).toBe(extended);
  });

  it('extends the ambient scope for a lazy route, keeping its identity', async () => {
    const extended = count('scope:extend');
    const html = await (await fetch(`${fixture.url}/ambient/nav/vega`)).text();
    expect(html).toContain('route to vega<!-- --> <!-- -->true');
    expect(count('scope:extend')).toBe(extended + 1);
  });

  it('renders the boundary with 500 and the status text for a missing provider', async () => {
    const res = await fetch(`${fixture.url}/lazy/missing`);
    const html = await res.text();
    expect(res.status).toBe(500);
    expect(html).toContain('500<!-- --> <!-- -->Internal Server Error');
    expect(html).not.toContain('NEXUS_');
    expect(html).not.toContain('NavRoutes');
  });

  it('renders the boundary with 503 once the container is disposed', async () => {
    const res = await fetch(`${fixture.url}/gone`);
    const html = await res.text();
    expect(res.status).toBe(503);
    expect(html).toContain('503<!-- --> <!-- -->Service Unavailable');
    expect(html).not.toContain('NEXUS_');
  });

  it('answers 500 with no core text for a third-party construct code, logging one line for a page', async () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await fetch(`${fixture.url}/acme`);
    const html = await res.text();
    expect(res.status).toBe(500);
    expect(html).not.toContain('NEXUS_');
    expect(html).not.toContain('ACME_');
    expect(html).not.toContain('FlightLog');
    await settle();
    const lines = write.mock.calls.map(([first]) => String(first));
    write.mockRestore();
    expect(lines).toEqual(['[@nexusdi/react-router] scope:']);
  });

  it('logs one line for a resource route too, because React Router returns a thrown Response as it is', async () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await fetch(`${fixture.url}/acme/log.json`);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('NEXUS_');
    await settle();
    const lines = write.mock.calls.map(([first]) => String(first));
    write.mockRestore();
    // handleResourceRequest returns a thrown Response without calling
    // handleError; only an error that is not a Response reaches it.
    expect(lines).toEqual(['[@nexusdi/react-router] scope:']);
  });

  it('ends a request whose client leaves before its loader, with nothing uncaught', async () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    const uncaught: unknown[] = [];
    const record = (reason: unknown) => uncaught.push(reason);
    process.on('uncaughtException', record);
    process.on('unhandledRejection', record);
    const created = count('scope:create');
    const controller = new AbortController();
    const pending = fetch(`${fixture.url}/late`, {
      signal: controller.signal,
    }).catch(() => undefined);
    await settle(30);
    controller.abort();
    await pending;
    await settle(100);
    process.off('uncaughtException', record);
    process.off('unhandledRejection', record);
    const lines = write.mock.calls.map(([first]) => String(first));
    write.mockRestore();
    expect(uncaught).toEqual([]);
    expect(count('scope:create')).toBe(created);
    // React Router 8 checks the signal again before it runs the loaders,
    // so the loader's inject never meets the closed handle here and nothing
    // is logged; the unit suite covers the 499 the inject would throw.
    expect(lines).toEqual([]);
  });

  it('gives 50 concurrent requests 50 scopes', async () => {
    const created = count('scope:create');
    const disposed = count('scope:dispose');
    const pages = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        fetch(`${fixture.url}/course/S${i}?delay=5`, {
          headers: { 'x-mission-id': `survey-${i}` },
        }).then((r) => r.text()),
      ),
    );
    pages.forEach((html, i) =>
      expect(html).toContain(`survey-${i}: plotting S${i}`),
    );
    await until(() => count('scope:dispose') === disposed + 50);
    expect(count('scope:create')).toBe(created + 50);
  });

  it('keeps nexus.server.ts and core out of the client build', () => {
    const dir = join(FIXTURE, 'build', 'client', 'assets');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(text, file).not.toContain('nexus-server-fixture-marker');
      expect(text, file).not.toContain('nexusdi.error');
    }
  });
});
