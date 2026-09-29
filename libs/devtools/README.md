# @nexusdi/devtools

graph(), inspect() and trace() for NexusDI, with `@nexusdi/errors`' messages, as a plugin.

```bash
npm install @nexusdi/devtools
```

`devtools()` registers `graph()` for a container and formats its errors as `@nexusdi/errors` does. `trace(fn)` hands every lifecycle event to `fn`. `inspect(root)` returns the graph `Nexus.check` compiles and builds nothing, for a CLI or a CI job.

<!-- #region graph -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { devtools, graph, inspect, trace } from '@nexusdi/devtools';
import type { TraceEvent } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class ShipComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: ShipComputer }),
  ],
});
const events: TraceEvent[] = [];

await using ship = await Nexus.create(Engineering, {
  plugins: [devtools(), trace((event) => events.push(event))],
});
graph(ship).edges; // -> [{ from: 'p1', to: 'p0', kind: 'required' }]
events.map((event) => event.type); // -> ['compile', 'construct', 'construct']
inspect(Engineering).modules.length; // -> 1
```

<!-- #endregion graph -->

`graph()` returns plain JSON. Ids are stable for a given set of definitions. Minifiers rename classes, so a production graph can show `t` in place of `ShipComputer`; give tokens a description, or keep class names, where names matter.

A factory's `async` in `graph()` says whether its last build returned a thenable. `inspect()` builds nothing, so every provider's `async` in its graph is `null`.

## License

MIT
