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

describe('the shared event source', () => {
  it('opens one source for every subscriber', async () => {
    await using ship = await Nexus.create(TelemetryClient);
    const client = ship.get(TELEMETRY_CLIENT);
    const [a, b] = [vi.fn(), vi.fn()];
    client.subscribe(a, vi.fn());
    client.subscribe(b, vi.fn());
    expect(FakeEventSource.opened).toHaveLength(1);
    FakeEventSource.opened[0].emit('snapshot', JSON.stringify(shipAtStart));
    expect(a).toHaveBeenCalledWith(shipAtStart);
    expect(b).toHaveBeenCalledWith(shipAtStart);
  });

  it('keeps the source open until the last subscriber leaves', async () => {
    await using ship = await Nexus.create(TelemetryClient);
    const client = ship.get(TELEMETRY_CLIENT);
    const first = client.subscribe(vi.fn(), vi.fn());
    const second = client.subscribe(vi.fn(), vi.fn());
    first();
    expect(FakeEventSource.opened[0].closed).toBe(false);
    second();
    expect(FakeEventSource.opened[0].closed).toBe(true);
  });

  it('calls offline on every subscriber and clears the set', async () => {
    await using ship = await Nexus.create(TelemetryClient);
    const client = ship.get(TELEMETRY_CLIENT);
    const [a, b, next] = [vi.fn(), vi.fn(), vi.fn()];
    client.subscribe(next, a);
    client.subscribe(next, b);
    FakeEventSource.opened[0].emit('offline', 'ship offline');
    expect(a).toHaveBeenCalledWith('ship offline');
    expect(b).toHaveBeenCalledWith('ship offline');
    expect(FakeEventSource.opened[0].closed).toBe(true);
    client.subscribe(next, vi.fn());
    FakeEventSource.opened[1].emit('offline', 'again');
    FakeEventSource.opened[1].dispatchEvent(new Event('error'));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('opens a new source for a subscribe after offline', async () => {
    await using ship = await Nexus.create(TelemetryClient);
    const client = ship.get(TELEMETRY_CLIENT);
    const stale = vi.fn();
    client.subscribe(vi.fn(), stale);
    FakeEventSource.opened[0].dispatchEvent(new Event('error'));
    const next = vi.fn();
    client.subscribe(next, vi.fn());
    expect(FakeEventSource.opened).toHaveLength(2);
    FakeEventSource.opened[1].emit('snapshot', JSON.stringify(shipAtStart));
    expect(next).toHaveBeenCalledTimes(1);
    expect(stale).toHaveBeenCalledTimes(1);
    FakeEventSource.opened[1].dispatchEvent(new Event('error'));
    expect(stale).toHaveBeenCalledTimes(1);
  });

  it('does not call a stale subscriber for a snapshot on the new source', async () => {
    await using ship = await Nexus.create(TelemetryClient);
    const client = ship.get(TELEMETRY_CLIENT);
    const staleNext = vi.fn();
    client.subscribe(staleNext, vi.fn());
    FakeEventSource.opened[0].dispatchEvent(new Event('error'));
    client.subscribe(vi.fn(), vi.fn());
    FakeEventSource.opened[1].emit('snapshot', JSON.stringify(shipAtStart));
    expect(staleNext).not.toHaveBeenCalled();
  });

  it('is safe to call an unsubscribe twice', async () => {
    await using ship = await Nexus.create(TelemetryClient);
    const client = ship.get(TELEMETRY_CLIENT);
    const first = client.subscribe(vi.fn(), vi.fn());
    client.subscribe(vi.fn(), vi.fn());
    first();
    first();
    expect(FakeEventSource.opened[0].closed).toBe(false);
  });

  it.each([
    [
      'an offline event',
      (source: FakeEventSource) => source.emit('offline', 'x'),
    ],
    [
      'an error event',
      (source: FakeEventSource) => source.dispatchEvent(new Event('error')),
    ],
  ])(
    'opens a new source for a subscribe inside the callback of %s',
    async (_name, lose) => {
      await using ship = await Nexus.create(TelemetryClient);
      const client = ship.get(TELEMETRY_CLIENT);
      const again = vi.fn();
      const resubscribe = vi.fn(() => {
        client.subscribe(again, vi.fn());
      });
      client.subscribe(vi.fn(), resubscribe);
      lose(FakeEventSource.opened[0]);
      expect(resubscribe).toHaveBeenCalledTimes(1);
      expect(FakeEventSource.opened).toHaveLength(2);
      expect(FakeEventSource.opened[1].closed).toBe(false);
      FakeEventSource.opened[1].emit('snapshot', JSON.stringify(shipAtStart));
      expect(again).toHaveBeenCalledTimes(1);
      expect(resubscribe).toHaveBeenCalledTimes(1);
    },
  );

  it('closes nothing for an unsubscribe after offline cleared the set', async () => {
    await using ship = await Nexus.create(TelemetryClient);
    const client = ship.get(TELEMETRY_CLIENT);
    const stale = client.subscribe(vi.fn(), vi.fn());
    FakeEventSource.opened[0].dispatchEvent(new Event('error'));
    client.subscribe(vi.fn(), vi.fn());
    stale();
    expect(FakeEventSource.opened[1].closed).toBe(false);
  });
});
