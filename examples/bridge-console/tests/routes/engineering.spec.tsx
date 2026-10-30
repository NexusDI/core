import { act, fireEvent, screen } from '@testing-library/react';
import type { Scope } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';
import type { NexusSetupStep } from '@nexusdi/vitest';
import { Link, Outlet } from 'react-router';
import { describe, expect, vi } from 'vitest';

import { BRIDGE_LINK, type CommandAnswer } from '../../app/di/contracts';
import {
  FailingSnapshotLink,
  FakeBridgeLink,
  linkAt,
  shipAtStart,
} from '../doubles';
import {
  contextOf,
  test,
  withLink,
  type RenderRoute,
} from '../support/console';

vi.mock('../../app/nexus.server', () => import('../support/nexus-server'));

const engineering = await import('../../app/routes/systems/engineering');
const { action } = engineering;

/**
 * Renders the page with its loader and action in a request scope, as React
 * Router runs them, and waits for the loader's data.
 */
async function renderPage(
  renderRoute: RenderRoute,
  overrides?: NexusSetupStep,
) {
  const page = await renderRoute(engineering, {
    path: '/systems/engineering',
    overrides,
  });
  await screen.findByRole('button', { name: 'Set throttle' });
  return page;
}

describe('the engineering route', () => {
  test('renders the throttle and shields forms', async ({ renderRoute }) => {
    await renderPage(renderRoute);
    expect(screen.getByLabelText('Throttle')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Set throttle' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Raise shields' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Lower shields' })).toBeDefined();
  });

  test('shows the tick that applies a throttle', async ({ renderRoute }) => {
    await renderPage(renderRoute);
    fireEvent.click(screen.getByRole('button', { name: 'Set throttle' }));
    expect((await screen.findByRole('status')).textContent).toBe(
      'Queued for tick 1.',
    );
  });

  test('shows the refusal of a shields raise and its fix', async ({
    renderRoute,
  }) => {
    await renderPage(renderRoute);
    fireEvent.click(screen.getByRole('button', { name: 'Raise shields' }));
    expect(
      await screen.findByText(
        'MERIDIAN_POWER_BUDGET: The shields load needs 200 MW, and the router has 0 MW free beside the loads above it.',
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        'Fix: raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
      ),
    ).toBeDefined();
  });

  /**
   * Runs the action on a POST of `fields`, as a crafted request would send
   * it, and gives the command it handed the scope's bridge link.
   */
  async function sent(scope: Scope, fields: Record<string, string>) {
    const command = vi.spyOn(scope.get(BRIDGE_LINK), 'command');
    const url = new URL('http://bridge/systems/engineering');
    const args: Parameters<typeof action>[0] = {
      request: new Request(url, {
        method: 'POST',
        body: new URLSearchParams(fields),
      }),
      url,
      pattern: '/systems/engineering',
      params: {},
      context: contextOf(scope),
    };
    await action(args);
    expect(command).toHaveBeenCalledOnce();
    return command.mock.calls[0]?.[0];
  }

  test('forwards a throttle with no level as sent', async ({ openScope }) => {
    const scope = await openScope();
    expect(await sent(scope, { command: 'throttle' })).toStrictEqual({
      system: 'engineering',
      action: 'throttle',
    });
  });

  test('forwards a shields command with no raised as sent', async ({
    openScope,
  }) => {
    const scope = await openScope();
    expect(await sent(scope, { command: 'shields' })).toStrictEqual({
      system: 'engineering',
      action: 'shields',
    });
  });

  test('forwards an unknown command as sent', async ({ openScope }) => {
    const scope = await openScope();
    expect(await sent(scope, { command: 'vent' })).toStrictEqual({
      system: 'engineering',
      action: 'vent',
    });
  });
});

/** The text of each gauge on the page, in order. */
async function gauges() {
  const list = await screen.findByLabelText('Engineering gauges');
  return [...list.querySelectorAll('dd')].map((dd) => dd.textContent);
}

describe('the engineering gauges', () => {
  test('read the idle reactor at tick 0, where the router lists no load yet', async ({
    renderRoute,
  }) => {
    expect(shipAtStart.power.loads).toEqual([]);
    await renderPage(renderRoute);
    expect(await gauges()).toEqual(['0.00', '0.0 MW', '500.0 K', '0.0 MW']);
  });

  test('read the reactor, the coolant and the shields from the snapshot', async ({
    renderRoute,
  }) => {
    // Seed 7 at tick 18, after a throttle of 1 at tick 0 and a shields raise
    // at tick 17, which the router fits once the output passes 200 MW. The
    // numbers are the ship's own floats. bridge-api's readShip rounds them to
    // eight digits, and the page must read right without it.
    const busy: ShipReading = {
      ...shipAtStart,
      tick: 18,
      time: 9,
      reactor: {
        level: 0.18000000000000002,
        thermal: 653400000.0000001,
        electric: 217800000.00000003,
        tripped: false,
      },
      coolant: { temperature: 502.49791096128916 },
      power: {
        output: 217800000.00000003,
        loads: [
          { id: 'shields', priority: 2, demand: 200e6, allocated: 200e6 },
        ],
        shed: [],
      },
      setpoints: {
        ...shipAtStart.setpoints,
        reactor: { throttle: 1 },
        shields: { raised: true },
      },
    };
    await renderPage(renderRoute, withLink(linkAt(busy)));
    expect(await gauges()).toEqual(['0.18', '217.8 MW', '502.5 K', '200.0 MW']);
  });

  test('group the thousands of the full reactor output', async ({
    renderRoute,
  }) => {
    const full: ShipReading = {
      ...shipAtStart,
      reactor: { level: 1, thermal: 3.63e9, electric: 1.21e9, tripped: false },
      power: { ...shipAtStart.power, output: 1.21e9 },
    };
    await renderPage(renderRoute, withLink(linkAt(full)));
    expect((await gauges())[1]).toBe('1,210.0 MW');
  });

  test('say the snapshot is offline when the backend fails, and keep the forms', async ({
    renderRoute,
  }) => {
    await renderPage(renderRoute, withLink(FailingSnapshotLink));
    expect(await screen.findByText('Ship snapshot offline')).toBeDefined();
    expect(screen.queryByLabelText('Engineering gauges')).toBeNull();
    expect(screen.getByRole('button', { name: 'Set throttle' })).toBeDefined();
  });
});

describe('the engineering page after a command', () => {
  test('shows the new value and turns the answer to applied when a frame reaches its tick', async ({
    renderRoute,
  }) => {
    const { telemetry } = await renderPage(renderRoute);
    fireEvent.click(screen.getByRole('button', { name: 'Set throttle' }));
    expect((await screen.findByRole('status')).textContent).toBe(
      'Queued for tick 1.',
    );
    expect(await gauges()).toEqual(['0.00', '0.0 MW', '500.0 K', '0.0 MW']);
    act(() =>
      telemetry.push({
        ...shipAtStart,
        tick: 1,
        reactor: { ...shipAtStart.reactor, level: 0.5 },
      }),
    );
    expect(await gauges()).toEqual(['0.50', '0.0 MW', '500.0 K', '0.0 MW']);
    expect(screen.getByRole('status').textContent).toBe(
      'Queued for tick 1. Applied at tick 1.',
    );
  });

  test('keeps the queued line while frames stay before its tick', async ({
    renderRoute,
  }) => {
    class Later extends FakeBridgeLink {
      override async command(): Promise<CommandAnswer> {
        return { accepted: true, tick: 1205 };
      }
    }
    const { telemetry } = await renderPage(renderRoute, withLink(Later));
    fireEvent.click(screen.getByRole('button', { name: 'Set throttle' }));
    expect((await screen.findByRole('status')).textContent).toBe(
      'Queued for tick 1,205.',
    );
    act(() => telemetry.push({ ...shipAtStart, tick: 1204 }));
    expect(screen.getByRole('status').textContent).toBe(
      'Queued for tick 1,205.',
    );
    act(() => telemetry.push({ ...shipAtStart, tick: 1205 }));
    expect(screen.getByRole('status').textContent).toBe(
      'Queued for tick 1,205. Applied at tick 1,205.',
    );
  });

  test('shows the notice and its fix under the queued line', async ({
    renderRoute,
  }) => {
    class Noticing extends FakeBridgeLink {
      override async command(): Promise<CommandAnswer> {
        return {
          accepted: true,
          tick: 1,
          notice: { code: 'X', message: 'It waits.', fix: 'Start it.' },
        };
      }
    }
    await renderPage(renderRoute, withLink(Noticing));
    fireEvent.click(screen.getByRole('button', { name: 'Set throttle' }));
    expect((await screen.findByRole('status')).textContent).toBe(
      'Queued for tick 1.It waits.Fix: Start it.',
    );
  });

  test('shows the offline reply beside the form and keeps the forms', async ({
    renderRoute,
  }) => {
    class Offline extends FakeBridgeLink {
      override async command(): Promise<CommandAnswer> {
        return {
          accepted: false,
          status: 503,
          code: 'BRIDGE_OFFLINE',
          message: 'The bridge is unreachable at http://bridge/.',
          fix: 'Start bridge-api.',
        };
      }
    }
    await renderPage(renderRoute, withLink(Offline));
    fireEvent.click(screen.getByRole('button', { name: 'Set throttle' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'BRIDGE_OFFLINE: The bridge is unreachable at http://bridge/.Fix: Start bridge-api.',
    );
    expect(screen.getByRole('button', { name: 'Set throttle' })).toBeDefined();
  });

  test('keeps the nav and shows the snapshot offline when the action throws', async ({
    renderRoute,
  }) => {
    class Throwing extends FakeBridgeLink {
      override async command(): Promise<CommandAnswer> {
        throw new Error('bridge-api answered 500 for /commands');
      }
    }
    await renderRoute(engineering, {
      path: '/systems/engineering',
      overrides: withLink(Throwing),
      layout: () => (
        <>
          <nav>
            <Link to="/">Home</Link>
          </nav>
          <Outlet />
        </>
      ),
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Set throttle' }),
    );
    expect(await screen.findByText('Ship snapshot offline')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Home' })).toBeDefined();
  });
});

describe('the throttle form', () => {
  const planned = (throttle: number): ShipReading => ({
    ...shipAtStart,
    setpoints: { ...shipAtStart.setpoints, reactor: { throttle } },
  });

  test('starts at the snapshot throttle', async ({ renderRoute }) => {
    await renderPage(renderRoute, withLink(linkAt(planned(0.4))));
    expect((screen.getByLabelText('Throttle') as HTMLInputElement).value).toBe(
      '0.4',
    );
  });

  test('keeps what the reader typed when a frame arrives', async ({
    renderRoute,
  }) => {
    const { telemetry } = await renderPage(
      renderRoute,
      withLink(linkAt(planned(0.4))),
    );
    const field = screen.getByLabelText('Throttle') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '0.7' } });
    act(() => telemetry.push({ ...planned(0.9), tick: 5 }));
    expect(field.value).toBe('0.7');
  });
});
