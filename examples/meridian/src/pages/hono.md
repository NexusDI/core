# Scope a Hono request examples

Regions for `apps/docs/content/hono.mdx`. Every block runs as a test, through Hono's in-process `app.request()`.

<!-- #region bridge -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';
import { Hono } from 'hono';

interface Mission {
  readonly id: string;
  readonly target: string;
}
interface Course {
  readonly to: string;
  readonly heading: number;
}
interface INavCharts {
  plot(to: string): Course;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
const MISSION = new Token<Mission>('Mission');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

class StarCharts implements INavCharts {
  plot(to: string): Course {
    return { to, heading: 42 };
  }
}
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

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, { useClass: StarCharts }),
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
  ],
  exports: [NAV_CHARTS, MISSION],
});
const BridgeApi = defineModule({
  name: 'BridgeApi',
  imports: [Tactical],
  providers: [
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
  exports: [FLIGHT_LOG],
});
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Tactical, BridgeApi],
});

const ship = await Nexus.create(Meridian);
const di = nexus(ship, {
  request: (c) => ({
    mission: {
      id: c.req.header('x-mission-id') ?? 'survey-7',
      target: 'Kepler-442b',
    },
  }),
});

const bridge = new Hono().use(di.middleware).get(
  '/course/:to',
  di.inject({ charts: NAV_CHARTS, log: FLIGHT_LOG }, ({ charts, log }, c) => {
    const to = c.req.param('to') ?? '';
    log.record(`plotting ${to}`);
    return c.json({ course: charts.plot(to), log: log.entries() });
  }),
);

const res = await bridge.request('/course/Kepler-442b', {
  headers: { 'x-mission-id': 'survey-7' },
});
const body = await res.json(); // -> { course: { to: 'Kepler-442b', heading: 42 }, log: ['survey-7: plotting Kepler-442b'] }
console.log(body);
await ship[Symbol.asyncDispose]();
```

<!-- #endregion bridge -->

<!-- #region missing -->

```ts @import.meta.vitest
import { Nexus, Token } from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';

interface IFlightLog {
  record(entry: string): void;
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

const ship = await Nexus.create([]);
const lines: string[] = [];
const di = nexus(ship, {
  request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }),
  log: (error, context) => lines.push(`${context.phase}: ${String(error)}`),
});

let failure: unknown;
try {
  // The route definition throws: no module provides FLIGHT_LOG.
  di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.text(String(log)));
} catch (error) {
  failure = error;
}
const thrown = (failure as Error).name; // -> 'BlueprintError'
console.log(lines[0]); // validate: MissingProviderError: [NEXUS_MISSING_PROVIDER] token=FlightLog module=root entry=deps.log. ...
const logged = lines.length; // -> 1
await ship[Symbol.asyncDispose]();
```

<!-- #endregion missing -->

<!-- #region errors -->

```ts @import.meta.vitest
import {
  Nexus,
  REQUEST,
  Token,
  defineModule,
  isNexusError,
  provide,
} from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';
import { Hono } from 'hono';

interface Mission {
  readonly id: string;
  readonly target: string;
}
const MISSION = new Token<Mission>('Mission');
const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(MISSION, {
      useFactory: (request): Mission => {
        if (request.mission.id === '') throw new Error('no mission id');
        return request.mission;
      },
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
  ],
});

const ship = await Nexus.create(Tactical);
const lines: string[] = [];
const di = nexus(ship, {
  request: (c) => ({
    mission: { id: c.req.header('x-mission-id') ?? '', target: 'Kepler-442b' },
  }),
  log: (error, context) =>
    lines.push(
      `${context.status} ${isNexusError(error) ? error.code : String(error)}`,
    ),
});

const bridge = new Hono().use(di.middleware).get(
  '/mission',
  di.inject({ mission: MISSION }, ({ mission }, c) => c.text(mission.id)),
);

const res = await bridge.request('/mission');
const reply = `${res.status} ${await res.text()}`; // -> '500 Internal Server Error'
const logged = lines; // -> ['500 NEXUS_PROVIDER_FAILED']
await ship[Symbol.asyncDispose]();
```

<!-- #endregion errors -->

<!-- #region ambient -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';
import { nodeScopes } from '@nexusdi/node';
import { Hono } from 'hono';

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

const ship = await Nexus.create(Tactical);
const scopes = nodeScopes();
const di = nexus(ship, {
  scopes,
  request: (c) => ({
    mission: {
      id: c.req.header('x-mission-id') ?? 'survey-7',
      target: 'Kepler-442b',
    },
  }),
});

// Deep in a service, with no access to the request:
const currentMission = () => scopes.current()?.get(MISSION).id;

const bridge = new Hono()
  .use(di.middleware)
  .get('/mission', (c) => c.text(currentMission() ?? 'none'));
const res = await bridge.request('/mission', {
  headers: { 'x-mission-id': 'survey-8' },
});
const reply = await res.text(); // -> 'survey-8'
console.log(reply);
await ship[Symbol.asyncDispose]();
```

<!-- #endregion ambient -->
