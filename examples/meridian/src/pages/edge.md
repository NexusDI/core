# Run on edge runtimes examples

Regions for `apps/docs/content/edge.mdx`. Every block runs as a test on Node. The bridge API's `adapter-runtimes` legs run the same adapter code on workerd, Deno, Bun and the Edge Runtime VM.

<!-- #region module-scope -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';
import { Hono } from 'hono';

interface Course {
  readonly to: string;
  readonly heading: number;
}
interface INavCharts {
  plot(to: string): Course;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

// Charts bundled with the Worker: building them needs no I/O.
const bundledCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };
const OfflineMeridian = defineModule({
  name: 'OfflineMeridian',
  providers: [provide(NAV_CHARTS, { useValue: bundledCharts })],
});

// Module scope: the isolate builds the container once, outside any request.
const ship = await Nexus.create(OfflineMeridian);
const di = nexus(ship, {
  request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }),
});
const app = new Hono().use(di.middleware).get(
  '/course/:to',
  di.inject({ charts: NAV_CHARTS }, ({ charts }, c) =>
    c.json(charts.plot(c.req.param('to') ?? '')),
  ),
);

const res = await app.request('/course/Kepler-442b');
const course = await res.json(); // -> { to: 'Kepler-442b', heading: 42 }
```

<!-- #endregion module-scope -->

<!-- #region function-form -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';
import { Hono } from 'hono';

interface Course {
  readonly to: string;
  readonly heading: number;
}
interface INavCharts {
  plot(to: string): Course;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

let downloads = 0;
// Stands in for a fetch of the charts, the I/O Workers refuses at module scope.
async function downloadCharts(): Promise<INavCharts> {
  downloads += 1;
  await new Promise((resolve) => setTimeout(resolve, 5));
  return { plot: (to) => ({ to, heading: 42 }) };
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useFactory: downloadCharts, deps: [] })],
});

// The function form: the adapter builds the container on the first request,
// once per isolate, and shares it with every later request.
const di = nexus(() => Nexus.create(Tactical), {
  request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }),
});
const app = new Hono().use(di.middleware).get(
  '/course/:to',
  di.inject({ charts: NAV_CHARTS }, ({ charts }, c) =>
    c.json(charts.plot(c.req.param('to') ?? '')),
  ),
);

const replies = await Promise.all([
  app.request('/course/Kepler-442b'),
  app.request('/course/Proxima-b'),
]);
const statuses = replies.map((reply) => reply.status); // -> [200, 200]
const built = downloads; // -> 1
```

<!-- #endregion function-form -->

<!-- #region lazy-scoped -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, provide } from '@nexusdi/core';

interface Mission {
  readonly id: string;
  readonly target: string;
}
const MISSION = new Token<Mission>('Mission');

let built = 0;
const ship = await Nexus.create([
  provide(MISSION, {
    useFactory: (request) => {
      built += 1;
      return request.mission;
    },
    deps: [REQUEST],
    lifetime: 'scoped',
    eager: false, // built on the first get(), so a request that never reads it runs nothing
  }),
]);

const shuttle = await ship.createScope({
  request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
});
const beforeGet = built; // -> 0
const id = shuttle.get(MISSION).id; // -> 'survey-7'
const afterGet = built; // -> 1
await shuttle[Symbol.asyncDispose]();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion lazy-scoped -->

<!-- #region check -->

```ts @import.meta.vitest
import {
  check,
  defineModule,
  isNexusError,
  provide,
  Token,
} from '@nexusdi/core';

interface Course {
  readonly to: string;
  readonly heading: number;
}
interface INavCharts {
  plot(to: string): Course;
}
interface IFlightLog {
  record(entry: string): void;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const COURSE = new Token<Course>('Course');

let downloads = 0;
const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, {
      useFactory: async (): Promise<INavCharts> => {
        downloads += 1;
        return { plot: (to) => ({ to, heading: 42 }) };
      },
      deps: [],
    }),
    // FLIGHT_LOG has no provider in this graph.
    provide(COURSE, {
      useFactory: (charts, log) => {
        log.record('plotting');
        return charts.plot('Kepler-442b');
      },
      deps: [NAV_CHARTS, FLIGHT_LOG],
    }),
  ],
});

let code = '';
try {
  check(Tactical); // in a test, so a wrong graph fails CI before deploy
} catch (error) {
  if (isNexusError(error)) code = error.code;
}
const failed = code; // -> 'NEXUS_BLUEPRINT_INVALID'
const ran = downloads; // -> 0
```

<!-- #endregion check -->
