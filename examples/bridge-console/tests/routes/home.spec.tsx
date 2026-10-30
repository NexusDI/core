import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { describe, expect, vi } from 'vitest';

import { WATCH_LOG } from '../../app/di/contracts';
import type { INavCharts } from '@nexusdi/meridian-systems/charts';
import {
  FailingSnapshotLink,
  FixedCharts,
  linkAt,
  shipAtStart,
} from '../doubles';
import { loaderArgs, test, withCharts, withLink } from '../support/console';

vi.mock('../../app/nexus.server', () => import('../support/nexus-server'));

const home = await import('../../app/routes/home');

/** The ship after a jump to Proxima-b. */
const jumped: ShipReading = {
  ...shipAtStart,
  ftl: { status: 'idle', charge: 0, sector: 'Proxima-b', jumped: 12 },
};

/** Charts that throw for a star they lack, as the real charts do. */
class RefusingCharts implements INavCharts {
  has(to: string) {
    return to === 'Proxima-b' || to === 'Kepler-442b';
  }
  plot(to: string) {
    if (!this.has(to)) throw new Error(`${to} is not charted`);
    return { to, heading: 42 };
  }
  stars() {
    return ['Kepler-442b', 'Proxima-b'];
  }
}

describe('Home route', () => {
  test('renders the mission and a fresh watch log from the request scope', async ({
    renderRoute,
  }) => {
    // CoursePlotter reads NAV_CHARTS in render, under the provider the
    // browser entry renders: the client graph and no request scope.
    await renderRoute(home, {
      path: '/',
      browser: withCharts(FixedCharts),
    });
    await waitFor(() => {
      expect(screen.getByText('survey-7')).toBeDefined();
      expect(screen.getByText('survey-7: docked')).toBeDefined();
    });
    // The plotter's own scope opens after hydration under the client graph,
    // and plots with the fixed charts.
    expect(
      await screen.findByText('heading 42', { exact: false, selector: 'span' }),
    ).toBeDefined();
  });

  test("records the form's entry through the action, in the request's scope", async ({
    renderRoute,
  }) => {
    await renderRoute(home, { path: '/', browser: withCharts(FixedCharts) });
    await screen.findByText('survey-7: docked');
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(await screen.findByText('survey-7: course plotted')).toBeDefined();
  });

  test('keeps no watch log entry from one request to the next', async ({
    openScope,
  }) => {
    const first = await openScope({ mission: 'survey-1' });
    const second = await openScope({ mission: 'survey-2' });
    const read = (scope: typeof first) => home.loader(loaderArgs(scope, '/'));
    expect((await read(first)).entries).toEqual(['survey-1: docked']);
    expect((await read(second)).entries).toEqual(['survey-2: docked']);
    expect(first.get(WATCH_LOG).entries()).not.toContain('survey-2: docked');
  });

  test("plots the mission's target before the ship jumps", async ({
    renderRoute,
  }) => {
    await renderRoute(home, { path: '/', browser: withCharts(FixedCharts) });
    expect(await screen.findByText('Kepler-442b: heading 42')).toBeDefined();
  });

  test('plots the sector the ship jumped to after a jump', async ({
    renderRoute,
  }) => {
    await renderRoute(home, {
      path: '/',
      overrides: withLink(linkAt(jumped)),
      browser: withCharts(FixedCharts),
    });
    expect(await screen.findByText('Proxima-b: heading 117')).toBeDefined();
    expect(screen.queryByText('Kepler-442b: heading 42')).toBeNull();
  });

  test("keeps the mission's target when the snapshot fails", async ({
    openScope,
  }) => {
    const scope = await openScope({ overrides: withLink(FailingSnapshotLink) });
    expect((await home.loader(loaderArgs(scope, '/'))).course).toEqual({
      to: 'Kepler-442b',
      heading: 42,
    });
  });

  test('shows the refusal for a star the charts do not hold, without throwing', async ({
    renderRoute,
  }) => {
    await renderRoute(home, { path: '/', browser: withCharts(RefusingCharts) });
    const input = await screen.findByRole('textbox', {
      name: /plot a course/i,
    });
    fireEvent.change(input, { target: { value: 'V' } });
    expect(await screen.findByText('V is not charted')).toBeDefined();
    fireEvent.change(input, { target: { value: 'Proxima-b' } });
    expect(
      await screen.findByText('heading 42', { exact: false, selector: 'span' }),
    ).toBeDefined();
  });
});
