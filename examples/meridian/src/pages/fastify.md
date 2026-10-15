# Scope a Fastify request examples

Regions for `apps/docs/content/fastify.mdx`. Every block runs as a test, through Fastify's in-process `inject()`.

<!-- #region bridge -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/fastify';
import Fastify from 'fastify';

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
  request: (req) => ({
    mission: {
      id: String(req.headers['x-mission-id'] ?? 'survey-7'),
      target: 'Kepler-442b',
    },
  }),
});

const bridge = Fastify();
await bridge.register(di.plugin);
bridge.get<{ Params: { to: string } }>(
  '/course/:to',
  di.inject({ charts: NAV_CHARTS, log: FLIGHT_LOG }, ({ charts, log }, req) => {
    log.record(`plotting ${req.params.to}`);
    return { course: charts.plot(req.params.to), log: log.entries() };
  }),
);

const res = await bridge.inject({
  url: '/course/Kepler-442b',
  headers: { 'x-mission-id': 'survey-7' },
});
const body = res.json(); // -> { course: { to: 'Kepler-442b', heading: 42 }, log: ['survey-7: plotting Kepler-442b'] }
console.log(body);
await bridge.close();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion bridge -->

<!-- #region missing -->

```ts @import.meta.vitest
import { Nexus, Token } from '@nexusdi/core';
import { nexus } from '@nexusdi/fastify';

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
  di.inject({ log: FLIGHT_LOG }, ({ log }) => String(log));
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
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { NexusHttpError, nexus } from '@nexusdi/fastify';
import Fastify from 'fastify';

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
const di = nexus(ship, {
  request: (req) => ({
    mission: {
      id: String(req.headers['x-mission-id'] ?? ''),
      target: 'Kepler-442b',
    },
  }),
});

// Fastify's logger, writing its error lines into an array.
const lines: { reqId: string; code?: string; msg: string }[] = [];
const bridge = Fastify({
  logger: {
    level: 'error',
    stream: { write: (line: string) => void lines.push(JSON.parse(line)) },
  },
});
await bridge.register(di.plugin);
bridge.get(
  '/mission',
  di.inject({ mission: MISSION }, ({ mission }) => mission.id),
);
// Sends the status and its text, and logs nothing: the adapter has logged.
bridge.setErrorHandler((error, req, reply) => {
  if (error instanceof NexusHttpError)
    return reply.status(error.statusCode).send(error.message);
  throw error;
});

const res = await bridge.inject({ url: '/mission' });
const reply = `${res.statusCode} ${res.body}`; // -> '500 Internal Server Error'
const logged = lines.map((line) => line.code); // -> ['NEXUS_PROVIDER_FAILED']
console.log(lines[0]?.reqId); // req-1, Fastify's request id
await bridge.close();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion errors -->

<!-- #region ambient -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/fastify';
import { nodeScopes } from '@nexusdi/node';
import Fastify from 'fastify';

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
  request: (req) => ({
    mission: {
      id: String(req.headers['x-mission-id'] ?? 'survey-7'),
      target: 'Kepler-442b',
    },
  }),
});

// Deep in a service, with no access to the request:
const currentMission = () => scopes.current()?.get(MISSION).id;

const bridge = Fastify();
await bridge.register(di.plugin);
bridge.get('/mission', () => currentMission() ?? 'none');

const res = await bridge.inject({
  url: '/mission',
  headers: { 'x-mission-id': 'survey-8' },
});
const reply = res.body; // -> 'survey-8'
console.log(reply);
await bridge.close();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion ambient -->

<!-- #region shutdown -->

```ts @import.meta.vitest
import { Nexus, Token, isNexusError, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/fastify';
import Fastify from 'fastify';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StarCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 42 };
  }
}

const ship = await Nexus.create([
  provide(NAV_CHARTS, { useClass: StarCharts }),
]);
const di = nexus(ship, {
  request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }),
});

// forceCloseConnections: close() also ends keep-alive connections.
const bridge = Fastify({ forceCloseConnections: true });
await bridge.register(di.plugin);
bridge.addHook('onClose', () => ship[Symbol.asyncDispose]());
await bridge.listen({ port: 0, host: '127.0.0.1' });
await bridge.close(); // runs onClose after in-flight requests drain

let code = '';
try {
  ship.get(NAV_CHARTS);
} catch (error) {
  if (isNexusError(error)) code = error.code;
}
const disposed = code; // -> 'NEXUS_DISPOSED'
```

<!-- #endregion shutdown -->
