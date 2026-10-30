import { describe, expect, vi } from 'vitest';

import { loaderArgs, test } from '../support/console';

vi.mock('../../app/nexus.server', () => import('../support/nexus-server'));

const { loader, middleware } = await import('../../app/routes/sectors');

describe('the lazy sectors route', () => {
  test('loads Navigation before its loader resolves NAV_ROUTES', async ({
    openScope,
  }) => {
    const scope = await openScope();
    const args = loaderArgs(scope, '/sectors/Kepler-442b', {
      sector: 'Kepler-442b',
    });
    const response = await middleware[0](args, async () =>
      Response.json(await loader(args)),
    );
    expect(await (response as Response).json()).toEqual({
      route: { to: 'Kepler-442b', heading: 42 },
    });
  });

  test('answers the refusal for a star the charts do not hold, with status 404', async ({
    openScope,
  }) => {
    const scope = await openScope();
    const args = loaderArgs(scope, '/sectors/Vega', { sector: 'Vega' });
    let answer: unknown;
    await middleware[0](args, async () => {
      answer = await loader(args);
      return Response.json(null);
    });
    expect(answer).toMatchObject({
      type: 'DataWithResponseInit',
      init: { status: 404 },
      data: {
        refusal: {
          code: 'MERIDIAN_UNCHARTED',
          message: "No star is charted as 'Vega'.",
          fix: 'plot a course to a charted star: Kepler-442b, Proxima-b, TRAPPIST-1e.',
        },
      },
    });
  });
});
