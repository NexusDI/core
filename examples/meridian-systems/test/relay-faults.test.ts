import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isNexusError, Nexus } from '@nexusdi/core';
import { afterEach, describe, expect, it } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { NAV_CHARTS } from '../src/systems/tactical/contracts';
import { BUNDLED_CHARTS } from '../src/systems/tactical/star-charts';

import { caught, SHIP_OPTIONS } from './support';

const servers: Server[] = [];

/** Starts a local relay whose handler gets every request, and answers its URL. */
async function relay(
  handler: Parameters<typeof createServer>[1],
): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** A relay that answers `body` as JSON text. */
const answering = (body: string) =>
  relay((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(body);
  });

/**
 * The MERIDIAN_RELAY error on the charts channel that `error` wraps. The
 * container reports a failed factory as NEXUS_PROVIDER_FAILED and keeps the
 * factory's error as its cause.
 */
function relayFault(error: unknown) {
  const cause = isNexusError(error, 'NEXUS_PROVIDER_FAILED')
    ? error.cause
    : error;
  return isNexusError(cause, 'MERIDIAN_RELAY') && cause.channel === 'charts'
    ? cause
    : undefined;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((done) => {
          server.closeAllConnections();
          server.close(() => done());
        }),
    ),
  );
});

describe('a relay that never answers', () => {
  it('fails startup with MERIDIAN_RELAY once the timeout runs out', async () => {
    // The server accepts the connection and holds the request open.
    const relayUrl = await relay(() => undefined);
    const start = Nexus.create(
      meridianSystems({ ...SHIP_OPTIONS, relayUrl, relayTimeout: 50 }),
    );
    await expect(start).rejects.toSatisfy(
      (error: unknown) => relayFault(error)?.reason === 'timeout',
    );
  });
});

describe('a relay that sends a partial body and stops', () => {
  it('fails startup with MERIDIAN_RELAY once the timeout runs out', async () => {
    const relayUrl = await relay((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"Vega":');
    });
    await expect(
      Nexus.create(
        meridianSystems({ ...SHIP_OPTIONS, relayUrl, relayTimeout: 50 }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => relayFault(error)?.reason === 'timeout',
    );
  });
});

describe('relayTimeout', () => {
  it.each([
    ['NaN', Number.NaN],
    ['a negative', -5],
    ['zero', 0],
    ['a fraction', 1.5],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a string', '50'],
    ['a value above 2 ** 31 - 1', 2_147_483_648],
  ])('refuses %s at create', async (_kind, relayTimeout) => {
    const error = await caught(() =>
      Nexus.create(
        meridianSystems({
          ...SHIP_OPTIONS,
          relayUrl: 'http://127.0.0.1:9',
          relayTimeout: relayTimeout as number,
        }),
      ),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      token: 'CommsOptions',
      cause: {
        code: 'NEXUS_INVALID_MODULE_OPTIONS',
        module: 'Comms',
        issues: [
          {
            path: ['relayTimeout'],
            message: `expected a whole number of ms from 1 to 2,147,483,647, got ${typeof relayTimeout === 'string' ? JSON.stringify(relayTimeout) : String(relayTimeout)}`,
          },
        ],
      },
    });
  });
});

describe('a relay that answers a table of the wrong shape', () => {
  it.each([
    ['null', 'null'],
    ['an array', '[42]'],
    ['a number', '42'],
    ['a string', '"Kepler-442b"'],
    ['a heading that is a string', '{"Kepler-442b":"42"}'],
    ['a heading that is null', '{"Kepler-442b":null}'],
    ['a heading that is an object', '{"Kepler-442b":{"deg":42}}'],
    ['a name that is __proto__', '{"Kepler-442b":42,"__proto__":7}'],
    ['a name that is constructor', '{"Kepler-442b":42,"constructor":7}'],
    ['a name that is toString', '{"Kepler-442b":42,"toString":7}'],
  ])('fails startup with MERIDIAN_RELAY for %s', async (_kind, body) => {
    const relayUrl = await answering(body);
    await expect(
      Nexus.create(meridianSystems({ ...SHIP_OPTIONS, relayUrl })),
    ).rejects.toSatisfy(
      (error: unknown) => relayFault(error)?.reason === 'malformed',
    );
    // A table that took __proto__ or constructor would change every object.
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(({} as { constructor: unknown }).constructor).toBe(Object);
  });
});

describe('a relay that answers a valid table', () => {
  it('starts the ship and plots over the downloaded table', async () => {
    const relayUrl = await answering(JSON.stringify(BUNDLED_CHARTS));
    await using ship = await Nexus.create(
      meridianSystems({ ...SHIP_OPTIONS, relayUrl }),
    );
    expect(ship.get(NAV_CHARTS).plot('Kepler-442b')).toEqual({
      to: 'Kepler-442b',
      heading: 42,
    });
  });

  it('starts the ship on the default timeout', async () => {
    const relayUrl = await answering('{"Vega":12.5}');
    await using ship = await Nexus.create(
      meridianSystems({ ...SHIP_OPTIONS, relayUrl }),
    );
    expect(ship.get(NAV_CHARTS).has('Vega')).toBe(true);
  });
});
