import type { TelemetryReading } from '@nexusdi/federation-contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IBridgeEndpoint } from './bridge-endpoint';
import { BridgeTelemetry } from './bridge-telemetry';

/** An EventSource double: records each source and replays events by hand. */
class FakeSource {
  static opened: FakeSource[] = [];
  closed = false;
  readonly #listeners = new Map<string, ((event: MessageEvent) => void)[]>();

  constructor(readonly url: URL) {
    FakeSource.opened.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data?: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
  }
}

const BRIDGE = 'http://127.0.0.1:4331/';
const endpoint = (url = Promise.resolve(new URL(BRIDGE))): IBridgeEndpoint => ({
  url: () => url,
});

const reading: TelemetryReading = {
  tick: 3,
  reactor: { level: 0, electric: 0 },
  coolant: { temperature: 300 },
  power: { loads: [{ id: 'life-support', allocated: 0 }], shed: [] },
  compartments: {
    habitat: { temperature: 293, pressure: 101_300, moles: { O2: 1 } },
  },
};

/** Lets the endpoint's answer reach the class. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('BridgeTelemetry', () => {
  beforeEach(() => {
    FakeSource.opened = [];
    vi.stubGlobal('EventSource', FakeSource);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens <url>telemetry on the first subscribe only', async () => {
    const feed = new BridgeTelemetry(endpoint());
    feed.subscribe(() => {});
    feed.subscribe(() => {});
    await settle();

    expect(FakeSource.opened.map(({ url }) => String(url))).toEqual([
      `${BRIDGE}telemetry`,
    ]);
  });

  it('reads connecting, then online with the reading of a snapshot', async () => {
    const feed = new BridgeTelemetry(endpoint());
    const listener = vi.fn();
    feed.subscribe(listener);
    expect(feed.state()).toEqual({ status: 'connecting', reading: null });

    await settle();
    FakeSource.opened[0]?.emit('snapshot', reading);

    expect(feed.state()).toEqual({ status: 'online', reading });
    expect(Object.isFrozen(feed.state())).toBe(true);
    expect(listener).toHaveBeenCalled();
  });

  it.each(['offline', 'error'])(
    'reads offline with no reading and closes the source on an %s event',
    async (type) => {
      const feed = new BridgeTelemetry(endpoint());
      feed.subscribe(() => {});
      await settle();
      const [source] = FakeSource.opened;
      source?.emit('snapshot', reading);
      source?.emit(type, 'ship offline');

      expect(feed.state()).toEqual({ status: 'offline', reading: null });
      expect(source?.closed).toBe(true);
      expect(FakeSource.opened).toHaveLength(1);
    },
  );

  it('closes the source on the last unsubscribe and opens a new one on a later subscribe', async () => {
    const feed = new BridgeTelemetry(endpoint());
    const first = feed.subscribe(() => {});
    const second = feed.subscribe(() => {});
    await settle();
    const [source] = FakeSource.opened;

    first();
    expect(source?.closed).toBe(false);
    second();
    expect(source?.closed).toBe(true);

    feed.subscribe(() => {});
    await settle();
    expect(FakeSource.opened).toHaveLength(2);
    expect(FakeSource.opened[1]?.closed).toBe(false);
  });

  it('keeps the state object between events', async () => {
    const feed = new BridgeTelemetry(endpoint());
    feed.subscribe(() => {});
    await settle();
    FakeSource.opened[0]?.emit('snapshot', reading);
    const online = feed.state();

    expect(feed.state()).toBe(online);
    FakeSource.opened[0]?.emit('snapshot', { ...reading, tick: 4 });
    expect(feed.state()).not.toBe(online);
    expect(feed.state().reading?.tick).toBe(4);
  });

  it('opens nothing when the endpoint answers after the last unsubscribe', async () => {
    let answer: (url: URL) => void = () => {};
    const late = new Promise<URL>((resolve) => (answer = resolve));
    const feed = new BridgeTelemetry(endpoint(late));
    const unsubscribe = feed.subscribe(() => {});
    unsubscribe();

    answer(new URL(BRIDGE));
    await settle();
    expect(FakeSource.opened).toEqual([]);
  });

  it('closes the source and drops its listeners when the container disposes it', async () => {
    const feed = new BridgeTelemetry(endpoint());
    const listener = vi.fn();
    feed.subscribe(listener);
    await settle();
    const [source] = FakeSource.opened;
    listener.mockClear();

    feed[Symbol.dispose]();
    expect(source?.closed).toBe(true);
    source?.emit('snapshot', reading);
    expect(listener).not.toHaveBeenCalled();

    let answer: (url: URL) => void = () => {};
    const late = new Promise<URL>((resolve) => (answer = resolve));
    const pending = new BridgeTelemetry(endpoint(late));
    pending.subscribe(() => {});
    pending[Symbol.dispose]();
    answer(new URL(BRIDGE));
    await settle();
    expect(FakeSource.opened).toHaveLength(1);
  });

  it('reads offline when the endpoint cannot be read', async () => {
    const feed = new BridgeTelemetry(
      endpoint(Promise.reject(new Error('/bridge.json answered 404'))),
    );
    feed.subscribe(() => {});
    await settle();

    expect(feed.state()).toEqual({ status: 'offline', reading: null });
    expect(FakeSource.opened).toEqual([]);
  });
});
