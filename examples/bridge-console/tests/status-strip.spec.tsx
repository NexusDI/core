import { act, render, screen } from '@testing-library/react';
import type { Nexus } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { NexusProvider } from '@nexusdi/react';
import { nexusTest } from '@nexusdi/vitest';
import { describe, expect, test as base } from 'vitest';

import { StatusStrip } from '../app/components/StatusStrip';
import { BridgeClient } from '../app/di/bridge.client';
import { TELEMETRY_CLIENT, type ITelemetryClient } from '../app/di/contracts';
import { shipAtStart } from './doubles';

/**
 * A TELEMETRY_CLIENT that hands the test its callbacks and counts unsubscribes.
 */
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

/** A fresh client graph per test, with the telemetry double. */
const test = nexusTest(base, BridgeClient, {
  setup: (builder) =>
    builder.override(TELEMETRY_CLIENT, { useClass: TelemetryDouble }),
});

/**
 * Renders the strip for `ship` under the client graph, and gives the
 * telemetry double the container built.
 */
function strip(nexus: Nexus, ship: ShipReading | null) {
  const view = render(
    <NexusProvider container={nexus}>
      <StatusStrip ship={ship} />
    </NexusProvider>,
  );
  return { telemetry: nexus.get(TELEMETRY_CLIENT) as TelemetryDouble, view };
}

const status = () => screen.getByRole('status', { name: 'Ship status' });

describe('the status strip', () => {
  test('renders the tick, the ship time and the habitat temperature and pressure', ({
    nexus,
  }) => {
    strip(nexus, shipAtStart);
    expect(status().textContent).toBe(
      'Tick0Ship time0 sHabitat temperature293 KHabitat pressure101.3 kPa',
    );
  });

  test('shows the habitat pressure the reading carries, in kPa', ({
    nexus,
  }) => {
    const habitat = { ...shipAtStart.compartments.habitat, pressure: 95_420 };
    strip(nexus, {
      ...shipAtStart,
      compartments: { ...shipAtStart.compartments, habitat },
    });
    expect(screen.getByText('95.4 kPa')).toBeDefined();
  });

  test('shows a warmed habitat in whole kelvin', ({ nexus }) => {
    const habitat = { ...shipAtStart.compartments.habitat, temperature: 292.7 };
    strip(nexus, {
      ...shipAtStart,
      compartments: { ...shipAtStart.compartments, habitat },
    });
    expect(screen.getByText('293 K')).toBeDefined();
  });

  test('renders Telemetry offline with no snapshot', ({ nexus }) => {
    strip(nexus, null);
    expect(status().textContent).toBe('Telemetry offline');
  });

  test('subscribes on mount and re-renders on each frame', ({ nexus }) => {
    const { telemetry } = strip(nexus, shipAtStart);
    expect(telemetry.next).toBeTypeOf('function');
    act(() => telemetry.next?.({ ...shipAtStart, tick: 600, time: 300 }));
    expect(screen.getByText('600')).toBeDefined();
    expect(screen.getByText('300 s')).toBeDefined();
  });

  test('shows Telemetry offline when the stream goes offline', ({ nexus }) => {
    const { telemetry } = strip(nexus, shipAtStart);
    act(() => telemetry.offline?.('ship offline'));
    expect(status().textContent).toBe('Telemetry offline');
  });

  test('unsubscribes on unmount', ({ nexus }) => {
    const { telemetry, view } = strip(nexus, shipAtStart);
    expect(telemetry.unsubscribed).toBe(0);
    view.unmount();
    expect(telemetry.unsubscribed).toBe(1);
  });
});
