import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeCommandLink } from './bridge-command-link';

const BRIDGE = 'http://127.0.0.1:4331/';
const endpoint = { url: async () => new URL(BRIDGE) };
const COURSE = { system: 'helm', action: 'course', to: 'Kepler-442b' };

/** Answers every fetch with `answer` and records the requests. */
function answering(answer: () => Promise<Response>) {
  const fetch =
    vi.fn<(url: URL, init: RequestInit) => Promise<Response>>(answer);
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('BridgeCommandLink', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the command as JSON to <url>commands and words a 202 as the tick', async () => {
    const fetch = answering(async () =>
      Response.json({ tick: 4 }, { status: 202 }),
    );

    expect(await new BridgeCommandLink(endpoint).send(COURSE)).toEqual({
      queued: true,
      tick: 4,
      text: 'Queued for tick 4',
    });
    expect(fetch).toHaveBeenCalledWith(new URL(`${BRIDGE}commands`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(COURSE),
    });
  });

  it('words a 400 with its code, message and fix', async () => {
    answering(async () =>
      Response.json(
        {
          code: 'MERIDIAN_BAD_COMMAND',
          message: "No star is charted as 'Vega'.",
          fix: 'plot a course to a charted star.',
        },
        { status: 400 },
      ),
    );

    expect(await new BridgeCommandLink(endpoint).send(COURSE)).toEqual({
      queued: false,
      text: "MERIDIAN_BAD_COMMAND: No star is charted as 'Vega'. Fix: plot a course to a charted star.",
    });
  });

  it('words a 409 with no fix as its code and message', async () => {
    answering(async () =>
      Response.json(
        { code: 'MERIDIAN_POWER_BUDGET', message: 'The reactor is cold.' },
        { status: 409 },
      ),
    );

    expect(await new BridgeCommandLink(endpoint).send(COURSE)).toEqual({
      queued: false,
      text: 'MERIDIAN_POWER_BUDGET: The reactor is cold.',
    });
  });

  it.each([
    ['a 500', async () => new Response(null, { status: 500 })],
    [
      'a rejected fetch',
      async () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])('words %s as an unreachable bridge', async (_, answer) => {
    answering(answer);

    expect(await new BridgeCommandLink(endpoint).send(COURSE)).toEqual({
      queued: false,
      text: 'The bridge is unreachable',
    });
  });

  it.each([
    ['a 202 with no tick', async () => Response.json({}, { status: 202 })],
    ['a 409 with no code', async () => Response.json({}, { status: 409 })],
    [
      'a 400 that is no JSON',
      async () => new Response('bad request', { status: 400 }),
    ],
  ])('words %s as an answer the shell cannot read', async (_, answer) => {
    answering(answer);

    expect(await new BridgeCommandLink(endpoint).send(COURSE)).toEqual({
      queued: false,
      text: 'The bridge sent an answer the shell cannot read',
    });
  });

  it('words an endpoint that cannot be read as an unreachable bridge', async () => {
    const link = new BridgeCommandLink({
      url: () => Promise.reject(new Error('/bridge.json answered 404')),
    });

    expect(await link.send(COURSE)).toEqual({
      queued: false,
      text: 'The bridge is unreachable',
    });
  });
});
