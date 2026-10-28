import { Nexus } from '@nexusdi/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TELEMETRY_CLIENT } from '../app/di/contracts';
import { TelemetryClient } from '../app/di/telemetry-client.module';
import { shipAtStart } from './doubles';
import { FakeEventSource } from './fake-event-source';

beforeEach(() => {
  FakeEventSource.opened = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});
afterEach(() => vi.unstubAllGlobals());

/**
 * A subscription through a container of the TelemetryClient module: the two
 * callbacks, the unsubscribe and the source it opened. Disposing it disposes
 * the container.
 */
async function subscribed() {
  const ship = await Nexus.create(TelemetryClient);
  const next = vi.fn();
  const offline = vi.fn();
  const unsubscribe = ship.get(TELEMETRY_CLIENT).subscribe(next, offline);
  const [source] = FakeEventSource.opened;
  return {
    next,
    offline,
    unsubscribe,
    source,
    [Symbol.asyncDispose]: () => ship[Symbol.asyncDispose](),
  };
}

describe('the event source telemetry client', () => {
  it('opens no source when the container builds it', async () => {
    await using ship = await Nexus.create(TelemetryClient);
    ship.get(TELEMETRY_CLIENT);
    expect(FakeEventSource.opened).toEqual([]);
  });

  it('opens one source at /telemetry on subscribe', async () => {
    await using sub = await subscribed();
    expect(FakeEventSource.opened).toEqual([sub.source]);
    expect(sub.source.url).toBe('/telemetry');
  });

  it('calls next with the parsed snapshot of a snapshot event', async () => {
    await using sub = await subscribed();
    const { next, source } = sub;
    source.emit('snapshot', JSON.stringify(shipAtStart));
    expect(next).toHaveBeenCalledWith(shipAtStart);
  });

  it("calls offline with an offline event's reason and closes the source", async () => {
    await using sub = await subscribed();
    const { offline, source } = sub;
    source.emit('offline', 'ship offline');
    expect(offline).toHaveBeenCalledWith('ship offline');
    expect(source.closed).toBe(true);
  });

  it("calls offline('telemetry lost') on an error and closes the source", async () => {
    await using sub = await subscribed();
    const { offline, source } = sub;
    source.dispatchEvent(new Event('error'));
    expect(offline).toHaveBeenCalledWith('telemetry lost');
    expect(source.closed).toBe(true);
  });

  it('closes the source on unsubscribe', async () => {
    await using sub = await subscribed();
    const { offline, unsubscribe, source } = sub;
    unsubscribe();
    expect(source.closed).toBe(true);
    expect(offline).not.toHaveBeenCalled();
  });
});
