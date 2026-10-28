import { screen } from '@testing-library/react';
import { describe, expect, vi } from 'vitest';

import { loaderArgs, test } from '../support/console';

vi.mock('../../app/nexus.server', () => import('../support/nexus-server'));

const course = await import('../../app/routes/course');

describe('the course route', () => {
  test("returns the watch log at once and the backend's answer as a promise", async ({
    openScope,
  }) => {
    const scope = await openScope({ mission: 'survey-9' });
    const data = await course.loader(
      loaderArgs(scope, '/course/Kepler-442b', { to: 'Kepler-442b' }),
    );
    expect(data.watch).toEqual(['survey-9: docked']);
    // Unawaited, so React Router streams it after the shell.
    expect(data.flight).toBeInstanceOf(Promise);
    expect(await data.flight).toEqual({
      course: { to: 'Kepler-442b', heading: 42 },
      entries: ['survey-9: plotting Kepler-442b'],
    });
  });

  test("labels the flight log as the log of one request, beside the console's watch log", async ({
    renderRoute,
  }) => {
    await renderRoute(course, {
      path: '/course/:to',
      at: '/course/Kepler-442b',
      mission: 'survey-9',
    });
    expect(
      await screen.findByRole('heading', {
        name: 'Flight log of this request',
      }),
    ).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Watch log' })).toBeDefined();
    expect(
      await screen.findByText('survey-9: plotting Kepler-442b'),
    ).toBeDefined();
    expect(screen.getByText('survey-9: docked')).toBeDefined();
  });
});
