import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { Nexus } from '@nexusdi/core';
import type { NodeScopes } from '@nexusdi/node';
import { beforeAll, onTestFinished } from 'vitest';

import type { BridgeOptions } from '../src/bridge/options';
import { createBridge as expressBridge } from '../src/entries/express';
import { createBridge as fastifyBridge } from '../src/entries/fastify';
import { createBridge as honoBridge } from '../src/entries/hono';
import { OfflineMeridian } from '../src/ship/meridian.module';
import { bridgePlugins } from '../src/ship/plugins';
import { FRAMEWORKS, type Framework } from './support';

export interface Answer {
  readonly status: number;
  readonly body: unknown;
}
/** A request body as it goes on the wire. */
export interface Payload {
  readonly type: string;
  readonly text: string;
}
export type Call = (
  ship: Nexus,
  method: 'GET' | 'POST',
  path: string,
  payload?: Payload,
  options?: BridgeOptions,
  headers?: Readonly<Record<string, string>>,
) => Promise<Answer>;

export const json = (body: unknown): Payload => ({
  type: 'application/json',
  text: JSON.stringify(body),
});

/** A JSON body sent with the media type in another case and a charset. */
export const charset = (body: unknown): Payload => ({
  type: 'Application/JSON; charset=utf-8',
  text: JSON.stringify(body),
});

/** Bodies every framework refuses the same way: none of them holds JSON it can read. */
export const UNREADABLE: readonly (readonly [string, Payload])[] = [
  ['malformed JSON', { type: 'application/json', text: '{ ticks' }],
  ['an empty JSON body', { type: 'application/json', text: '' }],
  ['a form', { type: 'application/x-www-form-urlencoded', text: 'ticks=3' }],
  ['plain text', { type: 'text/plain', text: '{ "ticks": 3 }' }],
];

/** The status and the body: parsed for a JSON answer, undefined for an empty one, else the text. */
function answerOf(status: number, type: unknown, text: string): Answer {
  const json = String(type ?? '').startsWith('application/json');
  if (json) return { status, body: JSON.parse(text) };
  return { status, body: text === '' ? undefined : text };
}

const answerOfResponse = async (res: Response): Promise<Answer> =>
  answerOf(res.status, res.headers.get('content-type'), await res.text());

const init = (
  method: string,
  payload?: Payload,
  headers: Readonly<Record<string, string>> = {},
): RequestInit =>
  payload === undefined
    ? { method, headers }
    : {
        method,
        headers: { ...headers, 'content-type': payload.type },
        body: payload.text,
      };

type Headers = Readonly<Record<string, string>>;
type Send = (
  method: 'GET' | 'POST',
  path: string,
  payload?: Payload,
  headers?: Headers,
) => Promise<Answer>;

/** A framework's bridge on one ship, ready for requests, and how to stop it. */
interface Client {
  readonly send: Send;
  readonly close: () => Promise<void>;
}

const open: Readonly<
  Record<Framework, (ship: Nexus, options?: BridgeOptions) => Promise<Client>>
> = {
  async hono(ship, options) {
    const bridge = honoBridge(ship, options);
    return {
      send: async (method, path, payload, headers) =>
        answerOfResponse(
          await bridge.request(path, init(method, payload, headers)),
        ),
      close: async () => {},
    };
  },
  async express(ship, options) {
    const server = expressBridge(ship, options).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    return {
      send: async (method, path, payload, headers) =>
        answerOfResponse(
          await fetch(
            `http://127.0.0.1:${port}${path}`,
            init(method, payload, headers),
          ),
        ),
      close: async () => {
        // fetch keeps its sockets alive, and close waits for every socket.
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      },
    };
  },
  async fastify(ship, options) {
    const bridge = await fastifyBridge(ship, options);
    return {
      async send(method, path, payload, headers = {}) {
        const res = await bridge.inject({
          method,
          url: path,
          ...(payload === undefined
            ? { headers }
            : {
                headers: { ...headers, 'content-type': payload.type },
                payload: payload.text,
              }),
        });
        return answerOf(res.statusCode, res.headers['content-type'], res.body);
      },
      close: () => bridge.close(),
    };
  },
};

interface Opened {
  readonly framework: Framework;
  readonly options: BridgeOptions | undefined;
  readonly client: Promise<Client>;
}

/** The bridges each ship serves in the running test, by framework and options. */
const opened = new WeakMap<Nexus, Opened[]>();

/** Options that set the same fields to the same values build the same bridge. */
const sameOptions = (a?: BridgeOptions, b?: BridgeOptions) => {
  const left = Object.entries(a ?? {}).filter(([, v]) => v !== undefined);
  const right = Object.entries(b ?? {}).filter(([, v]) => v !== undefined);
  return (
    left.length === right.length &&
    left.every(([key, value]) => b?.[key as keyof BridgeOptions] === value)
  );
};

/**
 * The bridge `framework` serves `ship` with `options`. The first request in a
 * test builds it, and the later ones reuse it, as a server serves every
 * request from one app. The bridge closes when the test finishes.
 */
function clientOf(
  framework: Framework,
  ship: Nexus,
  options?: BridgeOptions,
): Promise<Client> {
  const list = opened.get(ship) ?? [];
  const found = list.find(
    (entry) =>
      entry.framework === framework && sameOptions(entry.options, options),
  );
  if (found) return found.client;
  const client = open[framework](ship, options);
  list.push({ framework, options, client });
  opened.set(ship, list);
  onTestFinished(async () => {
    opened.delete(ship);
    // A bridge that failed to build failed the test already, and has nothing to close.
    await client.then(
      ({ close }) => close(),
      () => {},
    );
  });
  return client;
}

/** One request to `ship` through each framework's bridge. */
export const calls: Readonly<Record<Framework, Call>> = Object.fromEntries(
  FRAMEWORKS.map((framework) => [
    framework,
    async (ship, method, path, payload, options, headers) =>
      (await clientOf(framework, ship, options)).send(
        method,
        path,
        payload,
        headers,
      ),
  ]),
) as Record<Framework, Call>;

/**
 * The first request on each framework in a test file loads and compiles code
 * once per worker: Fastify's first instance builds its Ajv validators, the
 * first fetch loads undici and Express's first body loads iconv-lite, and the
 * simulation's first ticks run cold. On a loaded CI runner that took seconds
 * inside the 5 s budget of whichever test ran first. Each file that imports
 * these helpers pays it once here, in a hook with its own timeout.
 */
beforeAll(async () => {
  await using ship = await Nexus.create(OfflineMeridian, {
    plugins: bridgePlugins(),
  });
  const throttle = json({
    system: 'engineering',
    action: 'throttle',
    level: 0.5,
  });
  for (const framework of FRAMEWORKS) {
    const client = await open[framework](ship);
    try {
      await client.send('POST', '/commands', throttle);
      await client.send('POST', '/sim/advance', json({ ticks: 2 }));
      await client.send('GET', '/sim');
      await client.send('GET', '/commands');
    } finally {
      await client.close();
    }
  }
}, 60_000);

/** A ship whose plugins read `scopes`, which the bridge runs too, as the Node entries build them. */
export const scopedShip = (scopes: NodeScopes) =>
  Nexus.create(OfflineMeridian, { plugins: bridgePlugins({ scopes }) });
