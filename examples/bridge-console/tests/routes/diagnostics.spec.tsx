import { describe, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import type { NexusGraph } from '@nexusdi/devtools';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { NexusProvider } from '@nexusdi/react';
import { createTestingContainer } from '@nexusdi/testing';

import { BridgeClient } from '../../app/di/bridge.client';
import { TELEMETRY_CLIENT } from '../../app/di/contracts';
import { FailingSnapshotLink, FakeBridgeLink, shipAtStart } from '../doubles';
import { contextOf, loaderArgs, test, withLink } from '../support/console';

vi.mock('../../app/nexus.server', () => import('../support/nexus-server'));

const diagnostics = await import('../../app/routes/diagnostics');
const layout = await import('../../app/routes/ship-layout');

type Provider = NexusGraph['providers'][number];
const provider = (fields: Partial<Provider>): Provider => ({
  id: 'p0',
  token: 'Token',
  module: 'm0',
  lifetime: 'singleton',
  kind: 'class',
  eager: false,
  async: false,
  notes: [],
  unresolved: [],
  implementation: null,
  internal: false,
  ...fields,
});

/** A ship graph cut down to the root, Simulation and Telemetry. */
const shipGraph: NexusGraph = {
  modules: [
    {
      id: 'm0',
      name: 'Meridian',
      global: false,
      imports: ['m1', 'm2'],
      grants: [],
      exports: [],
    },
    {
      id: 'm1',
      name: 'Simulation',
      global: false,
      imports: [],
      grants: [],
      exports: ['p1'],
    },
    {
      id: 'm2',
      name: 'Telemetry',
      global: false,
      imports: ['m1'],
      grants: [],
      exports: ['p2'],
    },
  ],
  providers: [
    provider({ id: 'p0', token: 'Request', module: 'm0', internal: true }),
    provider({
      id: 'p1',
      token: 'TickLoop',
      module: 'm1',
      notes: ['system: Simulation'],
    }),
    provider({
      id: 'p2',
      token: 'TelemetryFeed',
      module: 'm2',
      notes: ['system: Telemetry'],
    }),
    provider({ id: 'p3', token: 'NavCharts', module: 'm0' }),
  ],
  edges: [],
};

/** A link whose backend serves `shipGraph`. */
class DevBridge extends FakeBridgeLink {
  override async graph() {
    return shipGraph;
  }
}

/** A link whose backend is down: every call rejects. */
class DownBridge extends FakeBridgeLink {
  override async snapshot(): Promise<ShipReading> {
    throw new Error('fetch failed');
  }
  override async graph(): Promise<NexusGraph | null> {
    throw new Error('fetch failed');
  }
}

function HydrateFallback() {
  return <p>Reading the graph</p>;
}

describe('the ship layout loader', () => {
  test("returns the backend's snapshot", async ({ openScope }) => {
    const scope = await openScope();
    expect(await layout.loader(loaderArgs(scope, '/diagnostics'))).toEqual(
      shipAtStart,
    );
  });

  test('returns null when the backend fails', async ({ openScope }) => {
    const scope = await openScope({ overrides: withLink(FailingSnapshotLink) });
    expect(await layout.loader(loaderArgs(scope, '/diagnostics'))).toBeNull();
  });

  test('never revalidates, since the strip follows the stream', () => {
    expect(layout.shouldRevalidate()).toBe(false);
  });
});

describe('the diagnostics route', () => {
  test('groups the providers under their module and prints each note', async ({
    renderRoute,
  }) => {
    await renderRoute(diagnostics, {
      path: '/diagnostics',
      overrides: withLink(DevBridge),
    });
    const telemetry = await screen.findByRole('region', { name: 'Telemetry' });
    expect(within(telemetry).getByText('TelemetryFeed')).toBeDefined();
    expect(within(telemetry).getByText('system: Telemetry')).toBeDefined();
    const simulation = screen.getByRole('region', { name: 'Simulation' });
    expect(within(simulation).getByText('TickLoop')).toBeDefined();
    expect(within(simulation).getByText('system: Simulation')).toBeDefined();
    const root = screen.getByRole('region', { name: 'Meridian' });
    expect(within(root).getByText('NavCharts')).toBeDefined();
    // Plumbing such as core's REQUEST stays off the page.
    expect(screen.queryByText('Request')).toBeNull();
  });

  test('says diagnostics are off when the backend serves no graph', async ({
    renderRoute,
  }) => {
    await renderRoute(diagnostics, { path: '/diagnostics' });
    expect(
      await screen.findByText('Diagnostics are off on this bridge'),
    ).toBeDefined();
  });

  test('says the bridge is unreachable under the offline strip when the backend is down', async ({
    openScope,
  }) => {
    const scope = await openScope({ overrides: withLink(DownBridge) });
    await using browser = await createTestingContainer(BridgeClient)
      .override(TELEMETRY_CLIENT, { useValue: { subscribe: () => () => {} } })
      .create();
    const Stub = createRoutesStub(
      [
        {
          Component: layout.default,
          loader: layout.loader,
          HydrateFallback,
          children: [
            {
              path: '/diagnostics',
              Component: diagnostics.default,
              ErrorBoundary: diagnostics.ErrorBoundary,
              loader: diagnostics.loader,
            },
          ],
        },
      ],
      contextOf(scope),
    );
    render(
      <NexusProvider container={browser}>
        <Stub initialEntries={['/diagnostics']} />
      </NexusProvider>,
    );
    expect(await screen.findByText('The bridge is unreachable')).toBeDefined();
    expect(
      screen.getByRole('status', { name: 'Ship status' }).textContent,
    ).toBe('Telemetry offline');
  });
});
