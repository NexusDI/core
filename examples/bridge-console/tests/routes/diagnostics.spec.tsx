import { afterAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import type { NexusGraph } from '@nexusdi/devtools';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { NexusProvider } from '@nexusdi/react';
import { createTestingContainer } from '@nexusdi/testing';

import { BridgeClient } from '../../app/bridge/bridge.client';
import { TELEMETRY_CLIENT } from '../../app/bridge/telemetry-client';
import { FakeBridgeLink, shipAtStart } from '../doubles';
import { built } from '../support/testing-di';
import { contextOf, loaderArgs, scopeWith } from './scope-with';

vi.mock('../../app/nexus.server', async () =>
  (await import('../support/testing-di')).shipServer(),
);

const {
  default: Diagnostics,
  loader,
  ErrorBoundary,
} = await import('../../app/routes/diagnostics');
const layout = await import('../../app/routes/ship-layout');

afterAll(() => Promise.all(built.map((s) => s[Symbol.asyncDispose]())));

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
      exports: [],
    },
    {
      id: 'm1',
      name: 'Simulation',
      global: false,
      imports: [],
      exports: ['p1'],
    },
    {
      id: 'm2',
      name: 'Telemetry',
      global: false,
      imports: ['m1'],
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

/** A link whose backend does not answer `GET /sim`. */
class SilentSim extends FakeBridgeLink {
  override async snapshot(): Promise<ShipReading> {
    throw new Error('bridge-api answered 502 for /sim');
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

/**
 * Renders /diagnostics for a request whose BRIDGE_LINK is an instance of
 * `link`.
 */
async function diagnostics(link: typeof FakeBridgeLink) {
  const scope = await scopeWith(link, built);
  const Stub = createRoutesStub(
    [{ path: '/diagnostics', Component: Diagnostics, HydrateFallback, loader }],
    contextOf(scope),
  );
  render(<Stub initialEntries={['/diagnostics']} />);
  return scope;
}

describe('the ship layout loader', () => {
  it("returns the backend's snapshot", async () => {
    await using scope = await scopeWith(FakeBridgeLink, built);
    expect(await layout.loader(loaderArgs(scope, '/diagnostics'))).toEqual(
      shipAtStart,
    );
  });

  it('returns null when the backend fails', async () => {
    await using scope = await scopeWith(SilentSim, built);
    expect(await layout.loader(loaderArgs(scope, '/diagnostics'))).toBeNull();
  });

  it('never revalidates, since the strip follows the stream', () => {
    expect(layout.shouldRevalidate()).toBe(false);
  });
});

describe('the diagnostics route', () => {
  it('groups the providers under their module and prints each note', async () => {
    const scope = await diagnostics(DevBridge);
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
    await scope[Symbol.asyncDispose]();
  });

  it('says diagnostics are off when the backend serves no graph', async () => {
    const scope = await diagnostics(FakeBridgeLink);
    expect(
      await screen.findByText('Diagnostics are off on this bridge'),
    ).toBeDefined();
    await scope[Symbol.asyncDispose]();
  });

  it('says the bridge is unreachable under the offline strip when the backend is down', async () => {
    const scope = await scopeWith(DownBridge, built);
    const browser = await createTestingContainer(BridgeClient)
      .override(TELEMETRY_CLIENT, { useValue: { subscribe: () => () => {} } })
      .create();
    built.push(browser);
    const Stub = createRoutesStub(
      [
        {
          Component: layout.default,
          loader: layout.loader,
          HydrateFallback,
          children: [
            {
              path: '/diagnostics',
              Component: Diagnostics,
              ErrorBoundary,
              loader,
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
    await scope[Symbol.asyncDispose]();
  });
});
