# React Router server rendering examples

Regions for `apps/docs/content/react-router-ssr.mdx`. Every block runs as a test. Each one calls the adapter's middleware and a loader the way React Router calls them for a request, with no server.

<!-- #region loader -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/react-router';
import { RouterContextProvider } from 'react-router';

interface Mission {
  readonly id: string;
  readonly target: string;
}
interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
const MISSION = new Token<Mission>('Mission');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

class StarCharts implements INavCharts {
  plot(to: string) {
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
const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(NAV_CHARTS, { useClass: StarCharts }),
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
});

// app/nexus.server.ts
const ship = await Nexus.create(Meridian);
const di = nexus(ship, {
  request: ({ request }) => ({
    mission: {
      id: request.headers.get('x-mission-id') ?? 'survey-7',
      target: 'Kepler-442b',
    },
  }),
});
const middleware = [di.middleware]; // app/root.tsx exports this as middleware

// app/routes/course.tsx
interface LoaderArgs {
  params: { to?: string };
  context: RouterContextProvider;
}
const loader = di.inject(
  { charts: NAV_CHARTS, log: FLIGHT_LOG },
  ({ charts, log }, { params }: LoaderArgs) => {
    const to = params.to ?? '';
    log.record(`plotting ${to}`);
    return { course: charts.plot(to), log: log.entries() };
  },
);

// What React Router does for GET /course/Kepler-442b
const params = { to: 'Kepler-442b' };
const context = new RouterContextProvider();
const request = new Request('http://bridge/course/Kepler-442b');
const args = { request, url: new URL(request.url), pattern: '/course/:to' };
const res = await middleware[0]!({ ...args, params, context }, async () =>
  Response.json(await loader({ params, context })),
);
const data = await res.json(); // -> { course: { to: 'Kepler-442b', heading: 42 }, log: ['survey-7: plotting Kepler-442b'] }
await ship[Symbol.asyncDispose]();
```

<!-- #endregion loader -->

<!-- #region lazy-shell -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/react-router';
import { RouterContextProvider } from 'react-router';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
interface INavRoutes {
  find(sector: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const NAV_ROUTES = new Token<INavRoutes>('NavRoutes');

class StarCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 42 };
  }
}
class SectorRoutes implements INavRoutes {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  find(sector: string) {
    const course = this.charts.plot(sector);
    return `${course.to}: heading ${course.heading}`;
  }
}

// The shell's charts module, one constant object.
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});
// The section imports the same object, so load() finds it in the graph.
const Navigation = defineModule({
  name: 'Navigation',
  imports: [Tactical],
  providers: [provide(NAV_ROUTES, { useClass: SectorRoutes })],
  exports: [NAV_ROUTES],
});

const ship = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [Tactical] }),
);
const di = nexus(ship, {
  request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }),
});

// app/routes/sectors.tsx
const navigation = di.load(Navigation);
const middleware = [navigation]; // the route exports this as middleware
interface LoaderArgs {
  params: { sector?: string };
  context: RouterContextProvider;
}
const loader = navigation.inject(
  { routes: NAV_ROUTES },
  ({ routes }, { params }: LoaderArgs) => routes.find(params.sector ?? ''),
);

// The first request into /sectors/Kepler-442b: root middleware, then the section's.
const params = { sector: 'Kepler-442b' };
const context = new RouterContextProvider();
const request = new Request('http://bridge/sectors/Kepler-442b');
const args = {
  request,
  url: new URL(request.url),
  pattern: '/sectors/:sector',
};
const res = await di.middleware(
  { ...args, params, context },
  async () =>
    (await middleware[0]!({ ...args, params, context }, async () =>
      Response.json(await loader({ params, context })),
    )) as Response,
);
const route = await res.json(); // -> 'Kepler-442b: heading 42'
await ship[Symbol.asyncDispose]();
```

<!-- #endregion lazy-shell -->

<!-- #region lazy-runtime -->

```ts @import.meta.vitest
import {
  Nexus,
  Token,
  defineModule,
  provide,
  type ModuleRef,
} from '@nexusdi/core';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
interface INavRoutes {
  find(sector: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const NAV_ROUTES = new Token<INavRoutes>('NavRoutes');

class SectorRoutes implements INavRoutes {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  find(sector: string) {
    return `${sector}: heading ${this.charts.plot(sector).heading}`;
  }
}

let downloads = 0;
// The app picks its charts module at runtime: the relay or the bundled table.
const tactical = (source: string) =>
  defineModule({
    name: 'Tactical',
    providers: [
      provide(NAV_CHARTS, {
        useFactory: (): INavCharts => {
          downloads += 1; // one download per charts module in the graph
          return { plot: (to) => ({ to: `${to} via ${source}`, heading: 42 }) };
        },
        deps: [],
      }),
    ],
    exports: [NAV_CHARTS],
  });
const charts = tactical('relay');

// A section built over the module object the root holds.
function navigation(shell: ModuleRef) {
  return defineModule({
    name: 'Navigation',
    imports: [shell],
    providers: [provide(NAV_ROUTES, { useClass: SectorRoutes })],
    exports: [NAV_ROUTES],
  });
}

const ship = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [charts] }),
);
await ship.load(navigation(charts));
const found = ship.get(NAV_ROUTES).find('Kepler-442b'); // -> 'Kepler-442b: heading 42'
const shared = downloads; // -> 1
await ship[Symbol.asyncDispose]();
```

<!-- #endregion lazy-runtime -->

<!-- #region route-test -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { existingScope, NEXUS_SCOPE, nexus } from '@nexusdi/react-router';
import { RouterContextProvider } from 'react-router';

interface Mission {
  readonly id: string;
  readonly target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
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
const BridgeApi = defineModule({
  name: 'BridgeApi',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
});

const ship = await Nexus.create(BridgeApi);
const di = nexus(ship, {
  request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }),
});
interface LoaderArgs {
  params: { to?: string };
  context: RouterContextProvider;
}
const loader = di.inject(
  { log: FLIGHT_LOG },
  ({ log }, { params }: LoaderArgs) => {
    log.record(`plotting ${params.to ?? ''}`);
    return log.entries();
  },
);

// The test owns the scope, and hands it to the loader under NEXUS_SCOPE.
const scope = await ship.createScope({
  request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
});
const context = new RouterContextProvider(
  new Map([[NEXUS_SCOPE, existingScope(scope)]]),
);
const entries = await loader({ params: { to: 'Kepler-442b' }, context }); // -> ['survey-7: plotting Kepler-442b']
await scope[Symbol.asyncDispose]();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion route-test -->

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
import { nexus } from '@nexusdi/react-router';
import { RouterContextProvider } from 'react-router';

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
  request: ({ request }) => ({
    mission: {
      id: request.headers.get('x-mission-id') ?? '',
      target: 'Kepler-442b',
    },
  }),
  log: (error, context) =>
    lines.push(
      `${context.status} ${isNexusError(error) ? error.code : String(error)}`,
    ),
});
interface LoaderArgs {
  context: RouterContextProvider;
}
const loader = di.inject(
  { mission: MISSION },
  ({ mission }, _args: LoaderArgs) => mission.id,
);

const context = new RouterContextProvider();
const request = new Request('http://bridge/');
const args = { request, url: new URL(request.url), pattern: '/', params: {} };
let thrown: unknown;
await di
  .middleware({ ...args, context }, async () =>
    Response.json(await loader({ context })),
  )
  .catch((error: unknown) => {
    thrown = error;
  });
const response = thrown as Response;
const status = `${response.status} ${response.statusText}`; // -> '500 Internal Server Error'
const logged = lines; // -> ['500 NEXUS_PROVIDER_FAILED']
await ship[Symbol.asyncDispose]();
```

<!-- #endregion errors -->

<!-- #region guard -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/react-router';
import { RouterContextProvider, type MiddlewareFunction } from 'react-router';

interface IAccessControl {
  mayFire(operator: string | undefined): boolean;
}
interface IMainDrive {
  fire(): string;
}
const ACCESS = new Token<IAccessControl>('AccessControl');
const MAIN_DRIVE = new Token<IMainDrive>('MainDrive');

class HelmOnlyAccess implements IAccessControl {
  mayFire(operator: string | undefined) {
    return operator === 'helm';
  }
}
class FusionDrive implements IMainDrive {
  fire() {
    return 'main drive fired';
  }
}

const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(ACCESS, { useClass: HelmOnlyAccess }),
    provide(MAIN_DRIVE, { useClass: FusionDrive }),
  ],
});

const ship = await Nexus.create(Meridian);
const di = nexus(ship, {
  request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }),
});

// app/routes/drive.tsx
const middleware: MiddlewareFunction<Response>[] = [
  di.injectMiddleware(
    { access: ACCESS },
    async ({ access }, { request }, next) => {
      if (!access.mayFire(request.headers.get('x-operator') ?? undefined))
        return new Response('Forbidden', { status: 403 });
      return next();
    },
  ),
];
const loader = di.inject({ drive: MAIN_DRIVE }, ({ drive }) => drive.fire());

// What React Router does for a request: root middleware, route middleware, loader.
async function visit(operator: string) {
  const context = new RouterContextProvider();
  const request = new Request('http://bridge/drive', {
    headers: { 'x-operator': operator },
  });
  const args = {
    request,
    url: new URL(request.url),
    pattern: '/drive',
    params: {},
    context,
  };
  const run = async () => new Response(await loader({ context }));
  return di.middleware(args, async () => {
    const answer = await middleware[0]!(args, run);
    return answer ?? run(); // React Router calls next itself when a middleware returns nothing
  });
}

const denied = await visit('guest');
const refusal = `${denied.status} ${await denied.text()}`; // -> '403 Forbidden'
const allowed = await visit('helm');
const fired = await allowed.text(); // -> 'main drive fired'
console.log(refusal, fired);
await ship[Symbol.asyncDispose]();
```

<!-- #endregion guard -->

<!-- #region data-mode -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/react-router';
import {
  createStaticHandler,
  RouterContextProvider,
  type MiddlewareFunction,
} from 'react-router';

interface IAccessControl {
  mayFire(operator: string | undefined): boolean;
}
interface IMainDrive {
  fire(): string;
}
const ACCESS = new Token<IAccessControl>('AccessControl');
const MAIN_DRIVE = new Token<IMainDrive>('MainDrive');

class HelmOnlyAccess implements IAccessControl {
  mayFire(operator: string | undefined) {
    return operator === 'helm';
  }
}
class FusionDrive implements IMainDrive {
  fire() {
    return 'main drive fired';
  }
}

const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(ACCESS, { useClass: HelmOnlyAccess }),
    provide(MAIN_DRIVE, { useClass: FusionDrive }),
  ],
});

const ship = await Nexus.create(Meridian);
const di = nexus(ship, {
  request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }),
});

// The variable carries the type, so TypeScript knows it runs in a data-mode route object.
const guard: MiddlewareFunction = di.injectMiddleware(
  { access: ACCESS },
  async ({ access }, { request }, next) => {
    if (!access.mayFire(request.headers.get('x-operator') ?? undefined))
      return new Response('Forbidden', { status: 403 });
    return next();
  },
);
const loader = di.inject(
  { drive: MAIN_DRIVE },
  ({ drive }) => new Response(drive.fire()),
);

const handler = createStaticHandler([
  {
    id: 'root',
    path: '/',
    middleware: [di.middleware],
    children: [{ id: 'drive', path: 'drive', middleware: [guard], loader }],
  },
]);

// What the server does for a request: root middleware, route middleware, loader.
async function visit(operator: string) {
  const request = new Request('http://bridge/drive', {
    headers: { 'x-operator': operator },
  });
  return (await handler.queryRoute(request, {
    requestContext: new RouterContextProvider(),
    generateMiddlewareResponse: (next) => next(request),
  })) as Response;
}

const denied = await visit('guest');
const refusal = `${denied.status} ${await denied.text()}`; // -> '403 Forbidden'
const allowed = await visit('helm');
const fired = await allowed.text(); // -> 'main drive fired'
console.log(refusal, fired);
await ship[Symbol.asyncDispose]();
```

<!-- #endregion data-mode -->
