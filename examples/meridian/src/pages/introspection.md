# Introspection and trace examples

Regions for `apps/docs/content/introspection.mdx`. Every block runs as a test.

<!-- #region register -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { devtools } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const Meridian = defineModule({
  name: 'Meridian',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
});

const dev = process.env.NODE_ENV !== 'production';
await using ship = await Nexus.create(Meridian, {
  plugins: dev ? [devtools()] : [],
});
const output = ship.get(REACTOR).output; // -> 1.21
console.log(output);
```

<!-- #endregion register -->

<!-- #region graph -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { devtools, graph } from '@nexusdi/devtools';

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
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
  ],
  exports: [COMPUTER],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Engineering] });

await using ship = await Nexus.create(Meridian, { plugins: [devtools()] });
const map = graph(ship);
const modules = map.modules.map((module) => module.name); // -> ['Meridian', 'Engineering']
console.log(modules);
const computer = map.providers.find((p) => p.token === 'ShipComputer');
const lifetime = computer?.lifetime; // -> 'singleton'
const kind = computer?.kind; // -> 'class'
const implementation = computer?.implementation; // -> 'QuantumComputer'
console.log(computer);
const edges = map.edges.map((edge) => edge.kind); // -> ['required']
console.log(edges);
```

<!-- #endregion graph -->

<!-- #region trace -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
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
  [Symbol.dispose]() {}
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
}

const events: TraceEvent[] = [];
const ship = await Nexus.create(
  [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
  ],
  { plugins: [trace((event) => events.push(event))] },
);
{
  await using shuttle = await ship.createScope();
}
await ship[Symbol.asyncDispose]();
const types = events.map((event) => event.type); // -> ['compile', 'construct', 'construct', 'scope:create', 'scope:dispose', 'dispose:instance', 'dispose']
console.log(types);
```

<!-- #endregion trace -->

<!-- #region inspect -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { inspect, toDot, toMermaid } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

let built = 0;
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
  constructor() {
    built++;
  }
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {
    built++;
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
  ],
  exports: [COMPUTER],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Engineering] });

const map = inspect(Meridian);
const constructed = built; // -> 0
console.log(constructed);
const mermaid = toMermaid(map);
const mermaidStart = mermaid.split('\n')[0]; // -> 'flowchart LR'
console.log(mermaid);
const dot = toDot(map);
const dotStart = dot.split('\n')[0]; // -> 'digraph nexus {'
console.log(dot);
```

<!-- #endregion inspect -->

<!-- #region minified-names -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { inspect } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');

// A minifier gives a class a short name such as `t`.
const t = class implements IReactorCore {
  readonly output = 1.21;
};

const map = inspect(
  defineModule({
    name: 'Engineering',
    providers: [provide(REACTOR, { useClass: t }), t],
  }),
);
const shown = map.providers.filter((p) => !p.internal);
const names = shown.map((p) => p.token); // -> ['ReactorCore', 't']
console.log(names);
```

<!-- #endregion minified-names -->
