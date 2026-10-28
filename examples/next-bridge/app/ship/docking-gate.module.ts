import { defineModule, provide, REQUEST, Token } from '@nexusdi/core';

interface Mission {
  readonly id: string;
  readonly target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
const MISSION = new Token<Mission>('Mission');
export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

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

/** The gate's graph: one request-scoped flight log, nothing else. */
export const DockingGate = defineModule({
  name: 'DockingGate',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
  exports: [FLIGHT_LOG],
});
