import { Nexus } from '@nexusdi/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TELEMETRY_CLIENT,
  TelemetryClient,
} from '../app/bridge/telemetry-client';
import { shipAtStart } from './doubles';
import { FakeEventSource } from './fake-event-source';

beforeEach(() => {
  FakeEventSource.opened = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});
afterEach(() => vi.unstubAllGlobals());

/** The client from a container of the TelemetryClient module, and the two callbacks. */
async function subscribed() {
  const ship = await Nexus.create(TelemetryClient);
  const next = vi.fn();
  const offline = vi.fn();
  const unsubscribe = ship.get(TELEMETRY_CLIENT).subscribe(next, offline);
  const [source] = FakeEventSource.opened;
  return { ship, next, offline, unsubscribe, source };
}

describe('the event source telemetry client', () => {
  it('opens no source when the container builds it', async () => {
    await using ship = await Nexus.create(TelemetryClient);
    ship.get(TELEMETRY_CLIENT);
    expect(FakeEventSource.opened).toEqual([]);
  });

  it('opens one source at /telemetry on subscribe', async () => {
    const { ship } = await subscribed();
    expect(FakeEventSource.opened.map((source) => source.url)).toEqual([
      '/telemetry',
    ]);
    await ship[Symbol.asyncDispose]();
  });

  it('calls next with the parsed snapshot of a snapshot event', async () => {
    const { ship, next, source } = await subscribed();
    source.emit('snapshot', JSON.stringify(shipAtStart));
    expect(next).toHaveBeenCalledWith(shipAtStart);
    await ship[Symbol.asyncDispose]();
  });

  it("calls offline with an offline event's reason and closes the source", async () => {
    const { ship, offline, source } = await subscribed();
    source.emit('offline', 'ship offline');
    expect(offline).toHaveBeenCalledWith('ship offline');
    expect(source.closed).toBe(true);
    await ship[Symbol.asyncDispose]();
  });

  it("calls offline('telemetry lost') on an error and closes the source", async () => {
    const { ship, offline, source } = await subscribed();
    source.dispatchEvent(new Event('error'));
    expect(offline).toHaveBeenCalledWith('telemetry lost');
    expect(source.closed).toBe(true);
    await ship[Symbol.asyncDispose]();
  });

  it('closes the source on unsubscribe', async () => {
    const { ship, offline, unsubscribe, source } = await subscribed();
    unsubscribe();
    expect(source.closed).toBe(true);
    expect(offline).not.toHaveBeenCalled();
    await ship[Symbol.asyncDispose]();
  });
});
