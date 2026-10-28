# next-bridge

A canary for how Next.js evaluates a server module. It is a test fixture. Nothing in it is a pattern to copy.

## What it gates

Next 16 evaluates `app/nexus.server.ts` once in the route handler layer and once in the server action layer, so each process builds two containers. The `@nexusdi/next` adapter moved to 0.5 because of that. The `e2e` target builds the app, starts it, calls a route handler and a server action, and asserts the counts in `app/gate-counter.ts`. The test fails when Next evaluates the module once per process, and that failure is the signal to build the adapter.

```sh
npx nx run @nexusdi/next-bridge:e2e
```

## What the app does

`app/nexus.server.ts` creates the container on first use, so `next build` evaluating the module builds none. `missionScope()` opens a scope for the current request with the `x-mission-id` header as its mission. The `DockingGate` module in `app/ship/docking-gate.module.ts` provides a flight log that lives for one request scope. `/api/course/[to]` and the form on `/gate` both read the same log.

## Why the tokens are classes

The fixture keeps its graph to one module and one token, because the test counts containers and does not model an application. A user writes the interface first. The service is a `Token<IFoo>`, the module binds it with `useClass`, and consumers declare the token in `deps`. A request-bound value comes from the scope:

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';

interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
interface Mission {
  readonly id: string;
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

const DockingGate = defineModule({
  name: 'DockingGate',
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

await using ship = await Nexus.create(DockingGate);
await using scope = await ship.createScope({
  request: { mission: { id: 'survey-7' } },
});
const log = scope.get(FLIGHT_LOG);
log.record('plotting Kepler-442b');
log.entries(); // -> ['survey-7: plotting Kepler-442b']
```
