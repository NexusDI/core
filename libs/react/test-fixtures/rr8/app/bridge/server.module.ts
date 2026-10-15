import { defineModule, provide } from '@nexusdi/core';

import { FLIGHT_LOG, type IFlightLog } from './contracts';

class ShuttleFlightLog implements IFlightLog {
  readonly #entries = ['rendered on the server'];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}

/** The server graph: FLIGHT_LOG is scoped, one log per request. */
export const BridgeServer = defineModule({
  name: 'BridgeServer',
  providers: [
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
  exports: [FLIGHT_LOG],
});
