import { defineModule, provide, REQUEST } from '@nexusdi/core';

import {
  FLIGHT_LOG,
  MISSION,
  type IFlightLog,
  type Mission,
} from './contracts';

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}

export const BridgeApi = defineModule({
  name: 'BridgeApi',
  providers: [
    // Sync and scoped: eager: false, so a request that never reads it never runs it.
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
      eager: false,
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
  exports: [MISSION, FLIGHT_LOG],
});
