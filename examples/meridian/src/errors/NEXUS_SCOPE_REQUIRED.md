# NEXUS_SCOPE_REQUIRED examples

Regions for `apps/docs/content/errors/NEXUS_SCOPE_REQUIRED.mdx`. Every block runs as a test.

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
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
  exports: [FLIGHT_LOG],
});

const getLog = (ship: Nexus) => {
  try {
    return ship.get(FLIGHT_LOG);
  } catch (error) {
    return error;
  }
};

await using ship = await Nexus.create(Tactical);
const thin = getLog(ship);
const line = isNexusError(thin) ? thin.message : null; // -> '[NEXUS_SCOPE_REQUIRED] token=FlightLog path=FlightLog. https://nexus.js.org/errors/NEXUS_SCOPE_REQUIRED'
console.log(line);

await using fullShip = await Nexus.create(Tactical, { plugins: [errors()] });
const full = getLog(fullShip);
const text = isNexusError(full) ? full.message.split('\n') : null; // -> ['[NEXUS_SCOPE_REQUIRED] FlightLog is scoped, and the root container has no scope.', '  Fix: resolve it from a scope: const scope = await ship.createScope(); scope.get(FlightLog).']
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
const target = shuttle.get(FLIGHT_LOG).mission.target; // -> 'Kepler-442b'
console.log(target);
```

<!-- #endregion fix -->
