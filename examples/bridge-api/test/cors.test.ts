import { Nexus } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { createBridge } from '../src/hono';
import { OfflineMeridian } from '../src/ship/meridian';
import { bridgePlugins } from '../src/ship/plugins';

const SHELL = 'http://127.0.0.1:4330';
const ALLOW_ORIGIN = 'access-control-allow-origin';

const ship = () => Nexus.create(OfflineMeridian, { plugins: bridgePlugins() });

describe('the Hono bridge with shell origins', () => {
  it('answers a preflight of POST /commands with 204, the origin and POST', async () => {
    await using nexus = await ship();
    const res = await createBridge(nexus, { origins: [SHELL] }).request(
      '/commands',
      {
        method: 'OPTIONS',
        headers: {
          origin: SHELL,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get(ALLOW_ORIGIN)).toBe(SHELL);
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-headers')).toBe(
      'content-type',
    );
  });

  it('allows the origin on GET /sim', async () => {
    await using nexus = await ship();
    const res = await createBridge(nexus, { origins: [SHELL] }).request(
      '/sim',
      { headers: { origin: SHELL } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get(ALLOW_ORIGIN)).toBe(SHELL);
  });

  it('allows no other origin', async () => {
    await using nexus = await ship();
    const res = await createBridge(nexus, { origins: [SHELL] }).request(
      '/sim',
      { headers: { origin: 'http://127.0.0.1:4331' } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get(ALLOW_ORIGIN)).toBeNull();
  });

  it('allows no origin when the options name none', async () => {
    await using nexus = await ship();
    const res = await createBridge(nexus).request('/sim', {
      headers: { origin: SHELL },
    });
    expect(res.headers.get(ALLOW_ORIGIN)).toBeNull();
  });
});
