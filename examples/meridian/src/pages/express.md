# Scope an Express request examples

Regions for `apps/docs/content/express.mdx`. Every block runs as a test, against an Express server on port 0, since Express has no in-process request API.

<!-- #region bridge -->

```ts @import.meta.vitest
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/express';
import express from 'express';

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
      id: req.get('x-mission-id') ?? 'survey-7',
      target: 'Kepler-442b',
    },
  }),
});

const bridge = express();
bridge.use(di.middleware);
bridge.get(
  '/course/:to',
  di.inject(
    { charts: NAV_CHARTS, log: FLIGHT_LOG },
    ({ charts, log }, req, res) => {
      const to = String(req.params.to);
      log.record(`plotting ${to}`);
      res.json({ course: charts.plot(to), log: log.entries() });
    },
  ),
);

const server = bridge.listen(0);
await once(server, 'listening');
const { port } = server.address() as AddressInfo;
const res = await fetch(`http://127.0.0.1:${port}/course/Kepler-442b`, {
  headers: { 'x-mission-id': 'survey-7' },
});
const body = await res.json(); // -> { course: { to: 'Kepler-442b', heading: 42 }, log: ['survey-7: plotting Kepler-442b'] }
console.log(body);
server.close();
await once(server, 'close');
await ship[Symbol.asyncDispose]();
```

<!-- #endregion bridge -->

<!-- #region missing -->

```ts @import.meta.vitest
import { Nexus, Token } from '@nexusdi/core';
import { nexus } from '@nexusdi/express';

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
  di.inject({ log: FLIGHT_LOG }, ({ log }, req, res) => res.send(String(log)));
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
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import {
  Nexus,
  REQUEST,
  Token,
  defineModule,
  isNexusError,
  provide,
} from '@nexusdi/core';
import { NexusHttpError, nexus } from '@nexusdi/express';
import express, { type ErrorRequestHandler } from 'express';

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
  request: (req) => ({
    mission: { id: req.get('x-mission-id') ?? '', target: 'Kepler-442b' },
  }),
  log: (error, context) =>
    lines.push(
      `${context.status} ${isNexusError(error) ? error.code : String(error)}`,
    ),
});

// Sends the status and its text, and logs nothing: the adapter has logged.
const nexusErrors: ErrorRequestHandler = (error, req, res, next) => {
  if (error instanceof NexusHttpError)
    res.status(error.status).send(error.message);
  else next(error);
};

const bridge = express();
bridge.use(di.middleware);
bridge.get(
  '/mission',
  di.inject({ mission: MISSION }, ({ mission }, req, res) =>
    res.send(mission.id),
  ),
);
bridge.use(nexusErrors);

const server = bridge.listen(0);
await once(server, 'listening');
const { port } = server.address() as AddressInfo;
const res = await fetch(`http://127.0.0.1:${port}/mission`);
const reply = `${res.status} ${await res.text()}`; // -> '500 Internal Server Error'
const logged = lines; // -> ['500 NEXUS_PROVIDER_FAILED']
server.close();
await once(server, 'close');
await ship[Symbol.asyncDispose]();
```

<!-- #endregion errors -->

<!-- #region ambient -->

```ts @import.meta.vitest
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/express';
import { nodeScopes } from '@nexusdi/node';
import express from 'express';

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
      id: req.get('x-mission-id') ?? 'survey-7',
      target: 'Kepler-442b',
    },
  }),
});

// Deep in a service, with no access to the request:
const currentMission = () => scopes.current()?.get(MISSION).id;

const bridge = express();
bridge.use(di.middleware);
bridge.get('/mission', (req, res) => {
  res.send(currentMission() ?? 'none');
});

const server = bridge.listen(0);
await once(server, 'listening');
const { port } = server.address() as AddressInfo;
const res = await fetch(`http://127.0.0.1:${port}/mission`, {
  headers: { 'x-mission-id': 'survey-8' },
});
const reply = await res.text(); // -> 'survey-8'
console.log(reply);
server.close();
await once(server, 'close');
await ship[Symbol.asyncDispose]();
```

<!-- #endregion ambient -->
