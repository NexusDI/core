# NEXUS_LIFETIME_VIOLATION examples

Regions for `apps/docs/content/errors/NEXUS_LIFETIME_VIOLATION.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface Mission {
  readonly id: string;
  readonly target: string;
}
interface IFlightLog {
  readonly mission: Mission;
}
const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  constructor(readonly mission: Mission) {}
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog }),
  ],
});

const thin = await Nexus.create(Tactical).catch((error: unknown) => error);
if (!isNexusError(thin, 'NEXUS_BLUEPRINT_INVALID')) throw thin;
const line = thin.errors[0]?.message; // -> '[NEXUS_LIFETIME_VIOLATION] path=FlightLog,Mission lifetimes=singleton,scoped. https://nexus.js.org/errors/NEXUS_LIFETIME_VIOLATION'
console.log(line);

const full = await Nexus.create(Tactical, { plugins: [errors()] }).catch(
  (error: unknown) => error,
);
if (!isNexusError(full, 'NEXUS_BLUEPRINT_INVALID')) throw full;
const text = full.errors[0]?.message.split('\n'); // -> ['[NEXUS_LIFETIME_VIOLATION] FlightLog is a singleton and captures a scoped provider: FlightLog (singleton) → Mission (scoped). A singleton outlives every scope.', '  Fix: make FlightLog scoped, or move the scoped dependency out of its dependency chain.']
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';

interface Mission {
  readonly id: string;
  readonly target: string;
}
interface IFlightLog {
  readonly mission: Mission;
}
const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  constructor(readonly mission: Mission) {}
}

const Tactical = defineModule({
  name: 'Tactical',
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

await using ship = await Nexus.create(Tactical);
await using shuttle = await ship.createScope({
  request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
});
const mission = shuttle.get(FLIGHT_LOG).mission.id; // -> 'survey-7'
console.log(mission);
```

<!-- #endregion fix -->
