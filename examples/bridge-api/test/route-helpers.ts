import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { Nexus } from '@nexusdi/core';
import type { NodeScopes } from '@nexusdi/node';

import { createBridge as expressBridge } from '../src/express';
import { createBridge as fastifyBridge } from '../src/fastify';
import { type BridgeOptions, createBridge as honoBridge } from '../src/hono';
import { OfflineMeridian } from '../src/ship/meridian';
import { bridgePlugins } from '../src/ship/plugins';

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

/** One request to `ship` through each framework's bridge. */
export const calls: Readonly<Record<'hono' | 'express' | 'fastify', Call>> = {
  async hono(ship, method, path, payload, options, headers) {
    return answerOfResponse(
      await honoBridge(ship, options).request(
        path,
        init(method, payload, headers),
      ),
    );
  },
  async express(ship, method, path, payload, options, headers) {
    const server = expressBridge(ship, options).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    try {
      return answerOfResponse(
        await fetch(
          `http://127.0.0.1:${port}${path}`,
          init(method, payload, headers),
        ),
      );
    } finally {
      server.close();
    }
  },
  async fastify(ship, method, path, payload, options, headers = {}) {
    const bridge = await fastifyBridge(ship, options);
    try {
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
    } finally {
      await bridge.close();
    }
  },
};

/** A ship whose plugins read `scopes`, which the bridge runs too, as the Node entries build them. */
export const scopedShip = (scopes: NodeScopes) =>
  Nexus.create(OfflineMeridian, { plugins: bridgePlugins({ scopes }) });
