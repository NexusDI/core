import { afterAll, describe, expect, it, vi } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { existingScope, NEXUS_SCOPE } from '@nexusdi/react-router';

import { built } from '../support/testing-di';

vi.mock('../../app/nexus.server', async () =>
  (await import('../support/testing-di')).sectorsServer(),
);

const { loader, middleware } = await import('../../app/routes/sectors');
const { ship } = await import('../../app/nexus.server');

afterAll(() => Promise.all(built.map((s) => s[Symbol.asyncDispose]())));

describe('the lazy sectors route', () => {
  it('loads Navigation before its loader resolves NAV_ROUTES', async () => {
    const scope = await ship.createScope({
      request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
    });
    const context = new RouterContextProvider(
      new Map([[NEXUS_SCOPE, existingScope(scope)]]),
    );
    const args = {
      params: { sector: 'Kepler-442b' },
      context,
      request: new Request('http://bridge/sectors/Kepler-442b'),
    } as never;
    const response = await middleware[0](args, async () =>
      Response.json(await loader(args)),
    );
    expect(await (response as Response).json()).toEqual({
      route: { to: 'Kepler-442b', heading: 42 },
    });
    await scope[Symbol.asyncDispose]();
  });
});
