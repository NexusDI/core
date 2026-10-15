import { defineModule, provide } from '@nexusdi/core';

import { FLIGHT_LOG, type IFlightLog } from './contracts';

// Its first entry matches the server's, so the hydration render matches the
// server HTML.
class MemoryFlightLog implements IFlightLog {
  readonly #entries = ['rendered on the server'];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}

/** The client graph: FLIGHT_LOG is a singleton, since the client root has no scope. */
export const BridgeClient = defineModule({
  name: 'BridgeClient',
  providers: [provide(FLIGHT_LOG, { useClass: MemoryFlightLog })],
  exports: [FLIGHT_LOG],
});
