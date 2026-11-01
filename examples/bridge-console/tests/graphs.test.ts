import { check, Nexus } from '@nexusdi/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeClient } from '../app/di/bridge.client';
import { BridgeConsole, DEFAULT_BRIDGE_API_URL } from '../app/di/bridge.server';
import { TELEMETRY_CLIENT } from '../app/di/contracts';
import { FakeEventSource } from './fake-event-source';

afterEach(() => vi.unstubAllGlobals());

describe('the bridge console graphs', () => {
  it('defaults BRIDGE_API_URL to the port bridge-api listens on', () => {
    expect(DEFAULT_BRIDGE_API_URL).toBe('http://127.0.0.1:3000/');
  });

  it('compiles the server graph, so a broken wiring fails before a page loads', () => {
    expect(() => check(BridgeConsole)).not.toThrow();
  });

  it('compiles the client graph', () => {
    expect(() => check(BridgeClient)).not.toThrow();
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
