import { act, renderHook } from '@testing-library/react';
import type { Nexus } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { NexusProvider } from '@nexusdi/react';
import { nexusTest } from '@nexusdi/vitest';
import type { ReactNode } from 'react';
import { describe, expect, test as base } from 'vitest';

import { useShipReading } from '../../app/hooks/use-ship-reading';
import { BridgeClient } from '../../app/di/bridge.client';
import {
  TELEMETRY_CLIENT,
  type ITelemetryClient,
} from '../../app/di/contracts';
import { shipAtStart } from '../doubles';

/** A TELEMETRY_CLIENT that hands the test its callbacks and counts unsubscribes. */
class TelemetryDouble implements ITelemetryClient {
  next?: (ship: ShipReading) => void;
  offline?: (reason: string) => void;
  unsubscribed = 0;
  subscribed = 0;
  subscribe(
    next: (ship: ShipReading) => void,
    offline: (reason: string) => void,
  ) {
    this.subscribed += 1;
    this.next = next;
    this.offline = offline;
    return () => {
      this.unsubscribed += 1;
    };
  }
}

const test = nexusTest(base, BridgeClient, {
  setup: (builder) =>
    builder.override(TELEMETRY_CLIENT, { useClass: TelemetryDouble }),
});

const at = (tick: number): ShipReading => ({ ...shipAtStart, tick });

function reading(nexus: Nexus, snapshot: ShipReading | null) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NexusProvider container={nexus}>{children}</NexusProvider>
  );
  const view = renderHook(({ snapshot }) => useShipReading(snapshot), {
    wrapper,
    initialProps: { snapshot },
  });
  return { telemetry: nexus.get(TELEMETRY_CLIENT) as TelemetryDouble, view };
}

describe('useShipReading', () => {
  test('starts from the loader snapshot', ({ nexus }) => {
    const { view } = reading(nexus, at(5));
    expect(view.result.current?.tick).toBe(5);
  });

  test('is null with no snapshot and no frame', ({ nexus }) => {
    const { view } = reading(nexus, null);
    expect(view.result.current).toBeNull();
  });

  test('follows each frame with a later tick', ({ nexus }) => {
    const { telemetry, view } = reading(nexus, at(5));
    act(() => telemetry.next?.(at(6)));
    expect(view.result.current?.tick).toBe(6);
    act(() => telemetry.next?.(at(7)));
    expect(view.result.current?.tick).toBe(7);
  });

  test('takes a frame when the loader had no snapshot', ({ nexus }) => {
    const { telemetry, view } = reading(nexus, null);
    act(() => telemetry.next?.(at(3)));
    expect(view.result.current?.tick).toBe(3);
  });

  test('keeps a newer frame when a stale snapshot arrives', ({ nexus }) => {
    const { telemetry, view } = reading(nexus, at(5));
    act(() => telemetry.next?.(at(9)));
    view.rerender({ snapshot: at(6) });
    expect(view.result.current?.tick).toBe(9);
  });

  test('takes a newer snapshot over an older frame', ({ nexus }) => {
    const { telemetry, view } = reading(nexus, at(5));
    act(() => telemetry.next?.(at(6)));
    view.rerender({ snapshot: at(8) });
    expect(view.result.current?.tick).toBe(8);
  });

  test('takes a new snapshot at the frame tick over the frame', ({ nexus }) => {
    const { telemetry, view } = reading(nexus, at(5));
    act(() => telemetry.next?.(at(7)));
    const loaded = {
      ...at(7),
      ftl: { status: 'idle' as const, charge: 0, sector: 'Sol', jumped: null },
    };
    view.rerender({ snapshot: loaded });
    expect(view.result.current).toBe(loaded);
  });

  test('takes a frame that arrives at the snapshot tick', ({ nexus }) => {
    const { telemetry, view } = reading(nexus, at(5));
    const frame = at(5);
    act(() => telemetry.next?.(frame));
    expect(view.result.current).toBe(frame);
  });

  test('keeps a frame over a lower-tick revalidation', ({ nexus }) => {
    const { telemetry, view } = reading(nexus, at(5));
    const frame = at(9);
    act(() => telemetry.next?.(frame));
    view.rerender({ snapshot: at(8) });
    expect(view.result.current).toBe(frame);
  });

  test('takes a higher-tick snapshot over a frame', ({ nexus }) => {
    const { telemetry, view } = reading(nexus, at(5));
    act(() => telemetry.next?.(at(7)));
    const next = at(8);
    view.rerender({ snapshot: next });
    expect(view.result.current).toBe(next);
  });

  test('is null once the stream goes offline', ({ nexus }) => {
    const { telemetry, view } = reading(nexus, at(5));
    act(() => telemetry.offline?.('ship offline'));
    expect(view.result.current).toBeNull();
  });

  test('recovers when the loader hands a new snapshot after offline', ({
    nexus,
  }) => {
    const { telemetry, view } = reading(nexus, at(5));
    act(() => telemetry.offline?.('ship offline'));
    expect(view.result.current).toBeNull();
    view.rerender({ snapshot: at(2) });
    expect(view.result.current?.tick).toBe(2);
    expect(telemetry.subscribed).toBe(2);
    act(() => telemetry.next?.(at(3)));
    expect(view.result.current?.tick).toBe(3);
  });

  test('stays offline when the same snapshot renders again', ({ nexus }) => {
    const snapshot = at(5);
    const { telemetry, view } = reading(nexus, snapshot);
    act(() => telemetry.offline?.('ship offline'));
    view.rerender({ snapshot });
    expect(view.result.current).toBeNull();
    expect(telemetry.subscribed).toBe(1);
  });

  test('stays offline when the loader changed the snapshot before the stream went offline', ({
    nexus,
  }) => {
    const { telemetry, view } = reading(nexus, at(5));
    view.rerender({ snapshot: at(6) });
    act(() => telemetry.offline?.('ship offline'));
    expect(view.result.current).toBeNull();
  });

  test('unsubscribes on unmount', ({ nexus }) => {
    const { telemetry, view } = reading(nexus, at(5));
    expect(telemetry.unsubscribed).toBe(0);
    view.unmount();
    expect(telemetry.unsubscribed).toBe(1);
  });
});
