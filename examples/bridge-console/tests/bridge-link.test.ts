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
/** The mission header of each request either backend received. */
const missions: (string | null)[] = [];
/** A server that answers every request with an empty 500. */
let broken: ServerType;
let brokenBase: string;

/** Serves `fetch` on a free port and resolves its base URL. */
async function listen(
  fetch: (request: Request) => Response | Promise<Response>,
) {
  const listening = serve({ port: 0, hostname: '127.0.0.1', fetch });
  await new Promise<void>((resolve) => listening.once('listening', resolve));
  const { port } = listening.address() as AddressInfo;
  return { server: listening, url: `http://127.0.0.1:${port}/` };
}

/** Answers with `app`, after it records the path and the mission header. */
function recorded(app: {
  fetch(request: Request): Response | Promise<Response>;
}) {
  return (request: Request) => {
    paths.push(new URL(request.url).pathname);
    missions.push(request.headers.get('x-mission-id'));
    return app.fetch(request);
  };
}

beforeAll(async () => {
  backend = await Nexus.create(OfflineMeridian);
  ({ server, url: base } = await listen(recorded(createBridge(backend))));
  devBackend = await Nexus.create(OfflineMeridian, {
    plugins: bridgePlugins({ dev: true }),
  });
  ({ server: devServer, url: devBase } = await listen(
    recorded(createBridge(devBackend, { graph: () => graph(devBackend) })),
  ));
  ({ server: broken, url: brokenBase } = await listen(
    () => new Response(null, { status: 500 }),
  ));
});

afterAll(async () => {
  // The ship's dispose ends every open telemetry stream, so the servers can
  // close.
  await backend[Symbol.asyncDispose]();
  await devBackend[Symbol.asyncDispose]();
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => devServer.close(resolve));
  await new Promise((resolve) => broken.close(resolve));
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

/**
 * Makes fetch answer `status` with a body nobody reads, until disposed.
 * `cancelled` turns true once the link cancels that body.
 */
function answerWith(status: number) {
  const answer = {
    cancelled: false,
    [Symbol.asyncDispose]: async () => fetch.mockRestore(),
  };
  const body = new ReadableStream({
    cancel() {
      answer.cancelled = true;
    },
  });
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(body, { status }));
  return answer;
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

  it('cancels the body of a course answer it rejects', async () => {
    await using answer = answerWith(404);
    await using bridge = await linkTo(base);
    await expect(bridge.link.course('Kepler-442b')).rejects.toThrow(
      'bridge-api answered 404 for /course/Kepler-442b',
    );
    expect(answer.cancelled).toBe(true);
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

describe("the bridge link's atmosphere reads", () => {
  it("returns the habitat analyzer's reading at tick 0", async () => {
    await using bridge = await linkTo(base);
    // Seed 7's analyzer at tick 0: the true air plus its noise, rounded to
    // the calibration's resolution of 0.01 K and 1 Pa.
    expect(await bridge.link.atmosphere('habitat')).toEqual({
      compartment: 'habitat',
      tick: 0,
      temperature: 293.04,
      pressure: 101_286,
      partial: { O2: 21_272, N2: 79_014, CO2: 44, H2O: 912, volatiles: 62 },
    });
    expect(paths.at(-1)).toBe('/compartments/habitat/atmosphere');
    expect(missions.at(-1)).toBe('survey-9');
  });

  it('encodes the compartment in the path', async () => {
    await using bridge = await linkTo(base);
    await expect(bridge.link.atmosphere('reactor bay')).rejects.toThrow(
      'bridge-api answered 404 for /compartments/reactor%20bay/atmosphere',
    );
    expect(paths.at(-1)).toBe('/compartments/reactor%20bay/atmosphere');
  });

  it('rejects a compartment the deck lacks with the 404', async () => {
    await using bridge = await linkTo(base);
    await expect(bridge.link.atmosphere('galley')).rejects.toThrow(
      'bridge-api answered 404 for /compartments/galley/atmosphere',
    );
  });

  it('cancels the body of a 404 it rejects', async () => {
    await using answer = answerWith(404);
    await using bridge = await linkTo(base);
    await expect(bridge.link.atmosphere('galley')).rejects.toThrow(
      'bridge-api answered 404 for /compartments/galley/atmosphere',
    );
    expect(answer.cancelled).toBe(true);
  });
});

describe("the bridge link's commands", () => {
  // The backend runs manual, so no tick passes between two commands.
  it('gives the tick that applies an accepted command', async () => {
    await using bridge = await linkTo(base);
    expect(
      await bridge.link.command({
        system: 'engineering',
        action: 'throttle',
        level: 1,
      }),
    ).toEqual({ accepted: true, tick: 1 });
    expect(paths.at(-1)).toBe('/commands');
    expect(missions.at(-1)).toBe('survey-9');
  });

  it('carries the flight log the backend answers with the tick', async () => {
    using fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json(
          { tick: 4, flightLog: ['survey-9: opened bridge-habitat'] },
          { status: 202 },
        ),
      );
    await using bridge = await linkTo(base);
    expect(
      await bridge.link.command({
        system: 'safety',
        action: 'open',
        door: 'bridge-habitat',
      }),
    ).toStrictEqual({
      accepted: true,
      tick: 4,
      flightLog: ['survey-9: opened bridge-habitat'],
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('leaves the flight log out when the backend answers none', async () => {
    using fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ tick: 4 }, { status: 202 }));
    await using bridge = await linkTo(base);
    expect(
      await bridge.link.command({ system: 'engineering', action: 'throttle' }),
    ).toStrictEqual({ accepted: true, tick: 4 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('gives the refusal of a load the reactor cannot power, with its fix', async () => {
    await using bridge = await linkTo(base);
    expect(
      await bridge.link.command({
        system: 'engineering',
        action: 'shields',
        raised: true,
      }),
    ).toEqual({
      accepted: false,
      status: 409,
      code: 'MERIDIAN_POWER_BUDGET',
      message:
        'The shields load needs 200 MW, and the router has 0 MW free beside the loads above it.',
      fix: 'raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
    });
  });

  it('gives the refusal of a command no system serves', async () => {
    await using bridge = await linkTo(base);
    expect(
      await bridge.link.command({ system: 'warp', action: 'engage' }),
    ).toMatchObject({
      accepted: false,
      status: 400,
      code: 'MERIDIAN_BAD_COMMAND',
    });
  });

  it('rejects when the backend answers 500', async () => {
    await using bridge = await linkTo(brokenBase);
    await expect(
      bridge.link.command({
        system: 'engineering',
        action: 'throttle',
        level: 1,
      }),
    ).rejects.toThrow('bridge-api answered 500 for /commands');
  });

  it('cancels the body of an answer it rejects, so the connection is freed', async () => {
    await using answer = answerWith(500);
    await using bridge = await linkTo(base);
    await expect(
      bridge.link.command({
        system: 'engineering',
        action: 'throttle',
        level: 1,
      }),
    ).rejects.toThrow('bridge-api answered 500 for /commands');
    expect(answer.cancelled).toBe(true);
  });
});

describe("the bridge link's FTL calls", () => {
  it('posts the spool with no body and gives the tick it queues for', async () => {
    using fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ tick: 101 }, { status: 202 }));
    await using bridge = await linkTo(base);
    expect(await bridge.link.spool()).toStrictEqual({
      accepted: true,
      tick: 101,
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${base}ftl/spool`);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get('x-mission-id')).toBe('survey-9');
  });

  it('posts the star of a jump and gives the tick it queues for', async () => {
    using fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ tick: 301 }, { status: 202 }));
    await using bridge = await linkTo(base);
    expect(await bridge.link.jump('Kepler-442b')).toStrictEqual({
      accepted: true,
      tick: 301,
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${base}ftl/jump`);
    expect(init?.body).toBe('{"to":"Kepler-442b"}');
  });

  it('gives the refusal of a jump on a spool below the full charge', async () => {
    const refusal = {
      code: 'MERIDIAN_FTL_NOT_SPOOLED',
      message: 'The FTL drive holds 0 GJ of the 90 GJ a jump needs.',
      fix: 'spool the drive and wait until it holds the full charge, then jump.',
    };
    using fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(refusal, { status: 409 }));
    await using bridge = await linkTo(base);
    expect(await bridge.link.jump('Kepler-442b')).toStrictEqual({
      accepted: false,
      status: 409,
      ...refusal,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects when the backend answers 500 for a spool', async () => {
    await using bridge = await linkTo(brokenBase);
    await expect(bridge.link.spool()).rejects.toThrow(
      'bridge-api answered 500 for /ftl/spool',
    );
  });
});
