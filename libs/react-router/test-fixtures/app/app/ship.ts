import {
  defineModule,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
} from '@nexusdi/core';

export interface Mission {
  id: string;
  target: string;
}
export interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
export interface INavRoutes {
  find(sector: string): string;
}
export const MISSION = new Token<Mission>('Mission');
export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
export const NAV_ROUTES = new Token<INavRoutes>('NavRoutes');

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

export const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(MISSION, {
      useFactory: (r: NexusRequest) =>
        r.mission ?? { id: 'survey-7', target: 'Kepler-442b' },
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
});

export const Navigation = defineModule({
  name: 'Navigation',
  providers: [
    provide(NAV_ROUTES, { useValue: { find: (s: string) => `route to ${s}` } }),
  ],
  exports: [NAV_ROUTES],
});
