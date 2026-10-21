import { act, render, screen } from '@testing-library/react';
import type { Nexus } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { NexusProvider } from '@nexusdi/react';
import { createTestingContainer } from '@nexusdi/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { BridgeClient } from '../app/bridge/bridge.client';
import {
  TELEMETRY_CLIENT,
  type ITelemetryClient,
} from '../app/bridge/telemetry-client';
import { StatusStrip } from '../app/components/StatusStrip';
import { shipAtStart } from './doubles';

const built: Nexus[] = [];
afterEach(() =>
  Promise.all(built.splice(0).map((s) => s[Symbol.asyncDispose]())),
);

/** A TELEMETRY_CLIENT that hands the test its callbacks and counts unsubscribes. */
class TelemetryDouble implements ITelemetryClient {
  next?: (ship: ShipReading) => void;
  offline?: (reason: string) => void;
  unsubscribed = 0;
  subscribe(
    next: (ship: ShipReading) => void,
    offline: (reason: string) => void,
  ) {
    this.next = next;
    this.offline = offline;
    return () => {
      this.unsubscribed += 1;
    };
  }
}

/** Renders the strip for `ship` under the client graph with the telemetry double. */
async function strip(ship: ShipReading | null) {
  const telemetry = new TelemetryDouble();
  const container = await createTestingContainer(BridgeClient)
    .override(TELEMETRY_CLIENT, { useValue: telemetry })
    .create();
  built.push(container);
  const view = render(
    <NexusProvider container={container}>
      <StatusStrip ship={ship} />
    </NexusProvider>,
  );
  return { telemetry, view };
}

const status = () => screen.getByRole('status', { name: 'Ship status' });

describe('the status strip', () => {
  it('renders the tick, the ship time and the habitat temperature and pressure', async () => {
    await strip(shipAtStart);
    expect(status().textContent).toBe(
      'Tick0Ship time0 sHabitat temperature293 KHabitat pressure101.3 kPa',
    );
  });

  it('shows the habitat pressure the reading carries, in kPa', async () => {
    const habitat = { ...shipAtStart.compartments.habitat, pressure: 95_420 };
    await strip({
      ...shipAtStart,
      compartments: { ...shipAtStart.compartments, habitat },
    });
    expect(screen.getByText('95.42 kPa')).toBeDefined();
  });

  it('renders Telemetry offline with no snapshot', async () => {
    await strip(null);
    expect(status().textContent).toBe('Telemetry offline');
  });

  it('subscribes on mount and re-renders on each frame', async () => {
    const { telemetry } = await strip(shipAtStart);
    expect(telemetry.next).toBeTypeOf('function');
    act(() => telemetry.next?.({ ...shipAtStart, tick: 600, time: 300 }));
    expect(screen.getByText('600')).toBeDefined();
    expect(screen.getByText('300 s')).toBeDefined();
  });

  it('shows Telemetry offline when the stream goes offline', async () => {
    const { telemetry } = await strip(shipAtStart);
    act(() => telemetry.offline?.('ship offline'));
    expect(status().textContent).toBe('Telemetry offline');
  });

  it('unsubscribes on unmount', async () => {
    const { telemetry, view } = await strip(shipAtStart);
    expect(telemetry.unsubscribed).toBe(0);
    view.unmount();
    expect(telemetry.unsubscribed).toBe(1);
  });
});
