import { Nexus, type TraceEvent } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { nexus } from '@nexusdi/react-router';

import { BridgeServer } from './bridge/server.module';

// The e2e test reads the trace through this global key.
const store = globalThis as { ['rr8-fixture.events']?: TraceEvent[] };
const events = (store['rr8-fixture.events'] ??= []);

export const ship = await Nexus.create(BridgeServer, {
  plugins: [trace((event) => events.push(event))],
});
export const di = nexus(ship);
