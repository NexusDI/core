import { Nexus } from '@nexusdi/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeClient } from '../app/bridge/bridge.client';
import { BridgeConsole } from '../app/bridge/bridge-console';
import { TELEMETRY_CLIENT } from '../app/bridge/telemetry-client';
import { FakeEventSource } from './fake-event-source';

afterEach(() => vi.unstubAllGlobals());

describe('the bridge console graphs', () => {
  it('compiles the server graph, so a broken wiring fails before a page loads', () => {
    expect(() => Nexus.check(BridgeConsole)).not.toThrow();
  });

  it('compiles the client graph', () => {
    expect(() => Nexus.check(BridgeClient)).not.toThrow();
  });

  // SSR resolves useService(TELEMETRY_CLIENT) from the server graph, and
  // the browser from the client graph, so both bind it.
  it.each([
    ['server', BridgeConsole],
    ['client', BridgeClient],
  ])(
    'resolves TELEMETRY_CLIENT in the %s graph and opens no source',
    async (_graph, root) => {
      FakeEventSource.opened = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      await using ship = await Nexus.create(root);
      expect(ship.get(TELEMETRY_CLIENT).subscribe).toBeTypeOf('function');
      expect(FakeEventSource.opened).toEqual([]);
    },
  );
});
