import { Nexus } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { BridgeClient } from '../app/bridge/bridge.client';
import { BridgeConsole } from '../app/bridge/bridge-console';

describe('the bridge console graphs', () => {
  it('compiles the server graph, so a broken wiring fails before a page loads', () => {
    expect(() => Nexus.check(BridgeConsole)).not.toThrow();
  });

  it('compiles the client graph', () => {
    expect(() => Nexus.check(BridgeClient)).not.toThrow();
  });
});
