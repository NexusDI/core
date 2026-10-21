import type { AddressInfo } from 'node:net';

import { serve, type ServerType } from '@hono/node-server';
import { defineModule, Nexus } from '@nexusdi/core';
import { createBridge } from '@nexusdi/bridge-api/hono';
import { OfflineMeridian } from '@nexusdi/bridge-api/ship';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BRIDGE_LINK, BridgeLink } from '../app/bridge/bridge-link';

let backend: Nexus;
let server: ServerType;
let base: string;
/** The path of each request the backend received, as it arrived. */
const paths: string[] = [];

beforeAll(async () => {
  backend = await Nexus.create(OfflineMeridian);
  const app = createBridge(backend);
  server = serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (request) => {
      paths.push(new URL(request.url).pathname);
      return app.fetch(request);
    },
  });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await backend[Symbol.asyncDispose]();
});

/** A scope of a container whose BridgeLink points at `url`, for mission survey-9. */
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
    await expect(bridge.link.course('Kepler-442b')).rejects.toThrow(/abort/i);
  });
});
