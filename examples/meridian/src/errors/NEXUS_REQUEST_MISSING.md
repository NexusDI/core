# NEXUS_REQUEST_MISSING examples

Regions for `apps/docs/content/errors/NEXUS_REQUEST_MISSING.mdx`. Every block runs as a test.

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

await using ship = await Nexus.create(Tactical);
const thin = await ship.createScope().catch((error: unknown) => error);
const line = isNexusError(thin) ? thin.message : null; // -> '[NEXUS_REQUEST_MISSING] dependents=Mission. https://nexus.js.org/errors/NEXUS_REQUEST_MISSING'
console.log(line);

await using fullShip = await Nexus.create(Tactical, { plugins: [errors()] });
const full = await fullShip.createScope().catch((error: unknown) => error);
const text = isNexusError(full) ? full.message.split('\n') : null; // -> ['[NEXUS_REQUEST_MISSING] createScope() received no request, and Mission depends on REQUEST.', '  Fix: pass createScope({ request }).']
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
const id = shuttle.get(FLIGHT_LOG).mission.id; // -> 'survey-7'
console.log(id);
```

<!-- #endregion fix -->
