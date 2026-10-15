# @nexusdi/react-router examples

## A loader test with a scope the test owns

`NEXUS_SCOPE` holds the request's scope handle on the router context. A test puts `existingScope(scope)` there and calls the loader directly, so it needs no server.

<!-- #region loader-test -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { existingScope, NEXUS_SCOPE, nexus } from '@nexusdi/react-router';
import { RouterContextProvider } from 'react-router';

interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
class ShuttleFlightLog implements IFlightLog {
  readonly #entries: string[] = [];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

const ship = await Nexus.create([
  provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
]);
const di = nexus(ship, {
  request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }),
});
const loader = di.inject(
  { log: FLIGHT_LOG },
  (
    { log },
    { params }: { params: { to: string }; context: RouterContextProvider },
  ) => {
    log.record(`plotting ${params.to}`);
    return log.entries();
  },
);

const scope = await ship.createScope({
  request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
});
const context = new RouterContextProvider(
  new Map([[NEXUS_SCOPE, existingScope(scope)]]),
);
const entries = await loader({ params: { to: 'Kepler-442b' }, context }); // -> ['plotting Kepler-442b']
await scope[Symbol.asyncDispose]();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion loader-test -->
