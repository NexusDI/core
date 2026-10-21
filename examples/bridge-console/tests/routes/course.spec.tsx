import { afterAll, describe, expect, it, vi } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { existingScope, NEXUS_SCOPE } from '@nexusdi/react-router';

import { built } from '../support/testing-di';

vi.mock('../../app/nexus.server', async () =>
  (await import('../support/testing-di')).courseServer(),
);

const { loader } = await import('../../app/routes/course');
const { ship } = await import('../../app/nexus.server');

afterAll(() => Promise.all(built.map((s) => s[Symbol.asyncDispose]())));

describe('the course route', () => {
  it("returns the watch log at once and the backend's answer as a promise", async () => {
    await using scope = await ship.createScope({
      request: { mission: { id: 'survey-9', target: 'Kepler-442b' } },
    });
    const data = await loader({
      params: { to: 'Kepler-442b' },
      context: new RouterContextProvider(
        new Map([[NEXUS_SCOPE, existingScope(scope)]]),
      ),
      request: new Request('http://bridge/course/Kepler-442b'),
    } as never);
    expect(data.watch).toEqual(['survey-9: docked']);
    // Unawaited, so React Router streams it after the shell.
    expect(data.flight).toBeInstanceOf(Promise);
    expect(await data.flight).toEqual({
      course: { to: 'Kepler-442b', heading: 42 },
      entries: ['survey-9: plotting Kepler-442b'],
    });
  });
});
