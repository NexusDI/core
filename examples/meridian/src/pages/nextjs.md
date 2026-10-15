# Scope a Next.js route handler or server action examples

Regions for `apps/docs/content/nextjs.mdx`. Every block runs as a test in Node, without a Next server. `examples/next-bridge`'s gate canary measures what Next itself does.

<!-- #region builder -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StarCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 42 };
  }
}
const Meridian = defineModule({
  name: 'Meridian',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
});

// app/nexus.server.ts: evaluating the module builds nothing.
let pending: Promise<Nexus> | undefined;
function ship(): Promise<Nexus> {
  pending ??= Nexus.create(Meridian).catch((error: unknown) => {
    pending = undefined; // the next call builds again
    throw error;
  });
  return pending;
}

const first = await ship();
const same = (await ship()) === first; // -> true
await first[Symbol.asyncDispose]();
```

<!-- #endregion builder -->

<!-- #region route -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';

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

const closed: string[] = [];
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
  [Symbol.dispose]() {
    closed.push(this.mission.id);
  }
}

const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
});

let pending: Promise<Nexus> | undefined;
const ship = () => (pending ??= Nexus.create(Meridian));

// Stands in for after() from next/server, which runs each callback once
// Next has sent the response.
const afterResponse: (() => Promise<void>)[] = [];
const after = (task: () => Promise<void>) => void afterResponse.push(task);

// app/course/[to]/route.ts
async function GET(
  request: Request,
  { params }: { params: Promise<{ to: string }> },
): Promise<Response> {
  const mission = {
    id: request.headers.get('x-mission-id') ?? 'survey-7',
    target: 'Kepler-442b',
  };
  const scope = await (await ship()).createScope({ request: { mission } });
  after(() => scope[Symbol.asyncDispose]());
  const { to } = await params;
  const log = scope.get(FLIGHT_LOG);
  log.record(`plotting ${to}`);
  return Response.json(log.entries());
}

const res = await GET(
  new Request('http://localhost/course/Kepler-442b', {
    headers: { 'x-mission-id': 'survey-7' },
  }),
  { params: Promise.resolve({ to: 'Kepler-442b' }) },
);
const entries = await res.json(); // -> ['survey-7: plotting Kepler-442b']
const beforeAfter = closed.length; // -> 0
for (const task of afterResponse) await task();
const afterAfter = closed; // -> ['survey-7']
await (await ship())[Symbol.asyncDispose]();
```

<!-- #endregion route -->

<!-- #region pool -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IRelayPool {
  readonly open: boolean;
  end(): void;
}
class RelayPool implements IRelayPool {
  open = true;
  end() {
    this.open = false;
  }
}

// The app's own key on globalThis: every layer of the process reads it.
const POOL_KEY: unique symbol = Symbol.for('meridian.relay-pool');
const global = globalThis as typeof globalThis & {
  [POOL_KEY]?: IRelayPool;
};
const relayPool = (): IRelayPool => (global[POOL_KEY] ??= new RelayPool());

// Next evaluates app/nexus.server.ts once per layer. Each evaluation makes
// its own token, its own module and its own container.
function evaluateLayer() {
  const RELAY_POOL = new Token<IRelayPool>('RelayPool');
  const Comms = defineModule({
    name: 'Comms',
    providers: [provide(RELAY_POOL, { useValue: relayPool() })],
  });
  let pending: Promise<Nexus> | undefined;
  return { RELAY_POOL, ship: () => (pending ??= Nexus.create(Comms)) };
}

const routes = evaluateLayer();
const actions = evaluateLayer();
const routeShip = await routes.ship();
const actionShip = await actions.ship();

const sameToken = routes.RELAY_POOL === actions.RELAY_POOL; // -> false
const pool = routeShip.get(routes.RELAY_POOL);
const samePool = pool === actionShip.get(actions.RELAY_POOL); // -> true

// A useValue is never disposed, so disposing one layer leaves the pool open.
await routeShip[Symbol.asyncDispose]();
const stillOpen = pool.open; // -> true
await actionShip[Symbol.asyncDispose]();
global[POOL_KEY]?.end();
delete global[POOL_KEY];
```

<!-- #endregion pool -->
