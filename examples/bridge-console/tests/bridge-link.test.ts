// @vitest-environment node
// The link runs on the console's server, so its test runs with Node's globals.
import type { AddressInfo } from 'node:net';

import { serve, type ServerType } from '@hono/node-server';
import { defineModule, Nexus } from '@nexusdi/core';
import { createBridge } from '@nexusdi/bridge-api/hono';
import { bridgePlugins, OfflineMeridian } from '@nexusdi/bridge-api/ship';
import { graph } from '@nexusdi/devtools';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { BRIDGE_LINK, BridgeLink } from '../app/bridge/bridge-link';

let backend: Nexus;
let server: ServerType;
let base: string;
/** A second backend with the dev plugins, which serves `GET /graph`. */
let devBackend: Nexus;
let devServer: ServerType;
let devBase: string;
/** The path of each request either backend received, as it arrived. */
const paths: string[] = [];

/** Serves `app` on a free port and returns the server and its base URL. */
async function listen(app: {
  fetch(request: Request): Response | Promise<Response>;
}) {
  const listening = serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (request) => {
      paths.push(new URL(request.url).pathname);
      return app.fetch(request);
    },
  });
  await new Promise<void>((resolve) => listening.once('listening', resolve));
  const { port } = listening.address() as AddressInfo;
  return { server: listening, base: `http://127.0.0.1:${port}/` };
}

beforeAll(async () => {
  backend = await Nexus.create(OfflineMeridian);
  ({ server, base } = await listen(createBridge(backend)));
  devBackend = await Nexus.create(OfflineMeridian, {
    plugins: bridgePlugins({ dev: true }),
  });
  ({ server: devServer, base: devBase } = await listen(
    createBridge(devBackend, { graph: () => graph(devBackend) }),
  ));
});

afterAll(async () => {
  // The ship's dispose ends every open telemetry stream, so the servers can
  // close.
  await backend[Symbol.asyncDispose]();
  await devBackend[Symbol.asyncDispose]();
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => devServer.close(resolve));
});

/** The first server-sent event of `body`, as text. */
async function firstEvent(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (!text.includes('\n\n')) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return { event: text.slice(0, text.indexOf('\n\n')), reader };
}

/**
 * A scope of a container whose BridgeLink points at `url`, for mission
 * survey-9.
 */
async function linkTo(url: string, signal?: AbortSignal) {
  const ship = await Nexus.create(
    defineModule({ name: 'LinkTest', imports: [BridgeLink.forRoot({ url })] }),
  );
  const scope = await ship.createScope({
    request: { mission: { id: 'survey-9', target: 'Kepler-442b' }, signal },
  });
  return {
    link: scope.get(BRIDGE_LINK),
    async [Symbol.asyncDispose]() {
      await scope[Symbol.asyncDispose]();
      await ship[Symbol.asyncDispose]();
    },
  };
}

describe('the bridge link', () => {
  it("returns the backend's course and flight log for the scope's mission", async () => {
    await using bridge = await linkTo(base);
    expect(await bridge.link.course('Kepler-442b')).toEqual({
      course: { to: 'Kepler-442b', heading: 42 },
      entries: ['survey-9: plotting Kepler-442b'],
    });
  });

  it('encodes the destination in the path', async () => {
    await using bridge = await linkTo(base);
    const answer = await bridge.link.course('Proxima b');
    expect(paths.at(-1)).toBe('/course/Proxima%20b');
    expect(answer.entries).toEqual(['survey-9: plotting Proxima b']);
  });

  it("rejects with the backend's status when it answers 404", async () => {
    await using bridge = await linkTo(`${base}uncharted/`);
    await expect(bridge.link.course('Kepler-442b')).rejects.toThrow(
      'bridge-api answered 404 for /uncharted/course/Kepler-442b',
    );
  });

  it("rejects when the request's signal aborts", async () => {
    const reader = new AbortController();
    reader.abort();
    await using bridge = await linkTo(base, reader.signal);
    const sent = paths.length;
    await expect(bridge.link.course('Kepler-442b')).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(paths).toHaveLength(sent);
  });

  it("returns the backend's ship reading at tick 0", async () => {
    await using bridge = await linkTo(base);
    const ship = await bridge.link.snapshot();
    expect(ship.tick).toBe(0);
    expect(ship.compartments.habitat.pressure).toBe(101_300);
    expect(ship.time).toBe(0);
    expect(Object.keys(ship.compartments)).toEqual([
      'bridge',
      'habitat',
      'reactor-bay',
      'airlock',
    ]);
  });

  it('returns the telemetry body, whose first event is a snapshot at tick 0', async () => {
    const reader = new AbortController();
    await using bridge = await linkTo(base, reader.signal);
    const { event, reader: body } = await firstEvent(
      await bridge.link.telemetry(),
    );
    const [kind, data] = event.split('\n');
    expect(kind).toBe('event: snapshot');
    expect(JSON.parse(data.replace(/^data: /, ''))).toMatchObject({ tick: 0 });
    expect(paths.at(-1)).toBe('/telemetry');
    // A reader who leaves the page aborts the request, and the body ends.
    reader.abort();
    await expect(body.read()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('returns null for the graph when the backend serves none', async () => {
    await using bridge = await linkTo(base);
    expect(await bridge.link.graph()).toBeNull();
  });

  it("cancels the 404's body, so the connection goes back to the pool", async () => {
    // The real backend sends the whole 404 at once, so the cancel shows only
    // on a body that is still open.
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal('fetch', async () => new Response(body, { status: 404 }));
    try {
      await using bridge = await linkTo(base);
      expect(await bridge.link.graph()).toBeNull();
      expect(cancelled).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns the backend's annotated graph when it serves one", async () => {
    await using bridge = await linkTo(devBase);
    const drawn = await bridge.link.graph();
    expect(drawn?.modules.map((module) => module.name)).toContain('Telemetry');
    expect(
      drawn?.providers.find((provider) => provider.token === 'TelemetryFeed')
        ?.notes,
    ).toEqual(['system: Telemetry']);
  });
});
