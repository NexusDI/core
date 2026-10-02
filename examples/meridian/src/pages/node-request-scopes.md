# Scope an HTTP request in Node examples

Regions for `apps/docs/content/node-request-scopes.mdx`. Every block runs as a test.

<!-- #region dispatch -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';

interface Mission {
  readonly id: string;
  readonly target: string;
}
interface IFlightLog {
  record(entry: string): string;
}
interface IncomingRequest {
  readonly mission: Mission;
}
const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    return `${this.mission.id}: ${entry}`;
  }
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
  ],
  exports: [MISSION],
});
const BridgeApi = defineModule({
  name: 'BridgeApi',
  imports: [Tactical],
  providers: [
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
  exports: [FLIGHT_LOG],
});
const Meridian = defineModule({ name: 'Meridian', imports: [BridgeApi] });

await using ship = await Nexus.create(Meridian);
const scopes = nodeScopes();

// Deep in the call chain: no scope is passed in, scopes.current() finds it.
async function logArrival(): Promise<string> {
  await Promise.resolve();
  const shuttle = scopes.current();
  if (shuttle === undefined) throw new Error('called outside a request');
  return shuttle.get(FLIGHT_LOG).record('arrived');
}

async function dispatch(req: IncomingRequest): Promise<string> {
  await using shuttle = await ship.createScope({
    request: { mission: req.mission },
  });
  return await scopes.run(shuttle, () => logArrival());
}

const req: IncomingRequest = {
  mission: { id: 'survey-7', target: 'Kepler-442b' },
};
const reply = await dispatch(req); // -> 'survey-7: arrived'
console.log(reply);
```

<!-- #endregion dispatch -->

<!-- #region outside-run -->

```ts @import.meta.vitest
import { nodeScopes } from '@nexusdi/node';

const scopes = nodeScopes();
const outside = scopes.current(); // -> undefined
console.log(outside);
```

<!-- #endregion outside-run -->

<!-- #region two-requests -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';

interface Mission {
  readonly id: string;
  readonly target: string;
}
const MISSION = new Token<Mission>('Mission');
const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
  ],
});

await using ship = await Nexus.create(Tactical);
const scopes = nodeScopes();

async function dispatch(mission: Mission): Promise<string | undefined> {
  await using shuttle = await ship.createScope({ request: { mission } });
  return await scopes.run(shuttle, async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return scopes.current()?.get(MISSION).id;
  });
}

const first = dispatch({ id: 'survey-7', target: 'Kepler-442b' });
const second = dispatch({ id: 'survey-8', target: 'Proxima b' });
const ids = await Promise.all([first, second]); // -> ['survey-7', 'survey-8']
console.log(ids);
```

<!-- #endregion two-requests -->
