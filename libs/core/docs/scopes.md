# Scopes

## Request scopes

A scope is a child container for one request, and `REQUEST` resolves to that request.

<!-- #region scopes -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule } from '@nexusdi/core';
import { provide, type NexusError } from '@nexusdi/core';

interface IFlightLog {
  readonly mission: string;
}
const MISSION = new Token<string>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
class ShuttleFlightLog implements IFlightLog {
  constructor(readonly mission: string) {}
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, {
      useClass: ShuttleFlightLog,
      deps: [MISSION],
      lifetime: 'scoped',
    }),
  ],
});

await using ship = await Nexus.create(Tactical);
await using shuttle = await ship.createScope({
  request: { mission: 'survey-7' },
});
shuttle.get(FLIGHT_LOG).mission; // -> 'survey-7'
shuttle.get(FLIGHT_LOG) === shuttle.get(FLIGHT_LOG); // -> true

let code = '';
try {
  ship.get(FLIGHT_LOG);
} catch (error) {
  code = (error as NexusError).code;
}
code; // -> 'NEXUS_SCOPE_REQUIRED'
```

<!-- #endregion scopes -->

## Extending a scope

After `load()`, `extend()` moves a scope to the loaded graph.

<!-- #region scope-extend -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface ISensorSweep {
  readonly target: string;
}
const SWEEP = new Token<ISensorSweep>('SensorSweep');
const Science = defineModule({
  name: 'Science',
  providers: [
    provide(SWEEP, {
      useFactory: () => ({ target: 'probe' }),
      lifetime: 'scoped',
    }),
  ],
  exports: [SWEEP],
});

await using ship = await Nexus.create(defineModule({ name: 'Meridian' }));
await using shuttle = await ship.createScope();
await ship.load(Science);
await shuttle.extend();
shuttle.get(SWEEP).target; // -> 'probe'
```

<!-- #endregion scope-extend -->
