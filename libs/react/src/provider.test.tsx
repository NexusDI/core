import { isNexusError, Nexus, provide, Token } from '@nexusdi/core';
import { act, render, screen } from '@testing-library/react';
import { StrictMode, Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NexusProvider, useContainer, useService } from './index.js';
import { Boundary } from '../test-support/boundary.js';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

function Heading() {
  const charts = useService(NAV_CHARTS);
  return <p>{charts.plot('Kepler-442b').heading}</p>;
}

/** Waits past the deferred release's setTimeout(0). */
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const disposed = (ship: Nexus) => {
  try {
    ship.get(NAV_CHARTS);
    return false;
  } catch (error) {
    return isNexusError(error, 'NEXUS_DISPOSED');
  }
};

afterEach(() => vi.restoreAllMocks());

describe('NexusProvider', () => {
  it('publishes a container to useService', async () => {
    await using ship = await Nexus.create([
      provide(NAV_CHARTS, { useValue: fakeCharts }),
    ]);
    const view = render(
      <StrictMode>
        <NexusProvider container={ship}>
          <Heading />
        </NexusProvider>
      </StrictMode>,
    );
    expect(screen.getByText('42')).toBeTruthy();
    view.unmount();
  });

  // React retries a suspended render only inside an awaited act() under
  // Testing Library, so both renders and the promise run in one.
  it('suspends on a container promise until create settles', async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const ready = Nexus.create([
      provide(NAV_CHARTS, {
        useFactory: async () => {
          await gate;
          return fakeCharts;
        },
      }),
    ]);
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <Suspense fallback={<p>Powering up</p>}>
          <NexusProvider container={ready}>
            <Heading />
          </NexusProvider>
        </Suspense>,
      );
    });
    expect(screen.getByText('Powering up')).toBeTruthy();
    await act(async () => {
      open();
      await ready;
    });
    expect(screen.getByText('42')).toBeTruthy();
    view.unmount();
    await (await ready)[Symbol.asyncDispose]();
  });

  it('throws a rejected create to the nearest error boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ready = Nexus.create([
      provide(NAV_CHARTS, {
        useFactory: async (): Promise<INavCharts> => {
          throw new Error('charts offline');
        },
      }),
    ]);
    ready.catch(() => undefined);
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <Boundary>
          <Suspense fallback={<p>Powering up</p>}>
            <NexusProvider container={ready}>
              <Heading />
            </NexusProvider>
          </Suspense>
        </Boundary>,
      );
      await ready.catch(() => undefined);
    });
    expect(screen.getByRole('alert').textContent).toContain(
      'NEXUS_PROVIDER_FAILED',
    );
    view.unmount();
  });

  it('renders fallback for a null container', () => {
    const view = render(
      <NexusProvider container={null} fallback={<p>Docking</p>}>
        <Heading />
      </NexusProvider>,
    );
    expect(screen.getByText('Docking')).toBeTruthy();
    view.unmount();
  });

  it('never disposes a container without dispose', async () => {
    await using ship = await Nexus.create([
      provide(NAV_CHARTS, { useValue: fakeCharts }),
    ]);
    const view = render(
      <NexusProvider container={ship}>
        <Heading />
      </NexusProvider>,
    );
    view.unmount();
    await tick();
    expect(disposed(ship)).toBe(false);
  });

  it('keeps the container through StrictMode with dispose, and disposes it on unmount', async () => {
    const ship = await Nexus.create([
      provide(NAV_CHARTS, { useValue: fakeCharts }),
    ]);
    const view = render(
      <StrictMode>
        <NexusProvider container={ship} dispose>
          <Heading />
        </NexusProvider>
      </StrictMode>,
    );
    await tick();
    expect(disposed(ship)).toBe(false);
    view.unmount();
    await tick();
    expect(disposed(ship)).toBe(true);
  });

  it('keeps a container two disposing providers share until the last unmounts', async () => {
    const ship = await Nexus.create([
      provide(NAV_CHARTS, { useValue: fakeCharts }),
    ]);
    const first = render(
      <StrictMode>
        <NexusProvider container={ship} dispose>
          <Heading />
        </NexusProvider>
      </StrictMode>,
    );
    const second = render(
      <StrictMode>
        <NexusProvider container={ship} dispose>
          <Heading />
        </NexusProvider>
      </StrictMode>,
    );
    first.unmount();
    await tick();
    expect(disposed(ship)).toBe(false);
    second.unmount();
    await tick();
    expect(disposed(ship)).toBe(true);
  });

  it('swaps containers and disposes the dropped one with dispose', async () => {
    const first = await Nexus.create([
      provide(NAV_CHARTS, { useValue: fakeCharts }),
    ]);
    await using second = await Nexus.create([
      provide(NAV_CHARTS, { useValue: { plot: (to) => ({ to, heading: 7 }) } }),
    ]);
    const view = render(
      <NexusProvider container={first} dispose>
        <Heading />
      </NexusProvider>,
    );
    await act(async () => {
      view.rerender(
        <NexusProvider container={second} dispose={false}>
          <Heading />
        </NexusProvider>,
      );
    });
    expect(screen.getByText('7')).toBeTruthy();
    await tick();
    expect(disposed(first)).toBe(true);
    expect(disposed(second)).toBe(false);
    view.unmount();
  });

  it('gives useContainer the root container', async () => {
    await using ship = await Nexus.create([
      provide(NAV_CHARTS, { useValue: fakeCharts }),
    ]);
    let seen: Nexus | undefined;
    function Probe() {
      seen = useContainer();
      return null;
    }
    const view = render(
      <NexusProvider container={ship}>
        <Probe />
      </NexusProvider>,
    );
    expect(seen).toBe(ship);
    view.unmount();
  });
});
