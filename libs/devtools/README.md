# @nexusdi/devtools

`@nexusdi/devtools` shows what a NexusDI container compiled and what it did: `graph()` and `inspect()` return the module graph as plain JSON, and `trace()` hands each lifecycle event to a callback.

```bash
npm install @nexusdi/devtools @nexusdi/core
```

The version of `@nexusdi/devtools` must equal the version of `@nexusdi/core`.

## Graph and trace

`devtools()` registers `graph()` for a container and formats its errors with `@nexusdi/errors`. `trace(fn)` is a plugin that hands every lifecycle event to `fn`. Register `devtools()` in development only:

```ts
const dev = process.env.NODE_ENV !== 'production';

await using ship = await Nexus.create(Meridian, {
  plugins: dev ? [devtools()] : [],
});
```

<!-- #region graph -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { devtools, graph, trace } from '@nexusdi/devtools';
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
const events: TraceEvent[] = [];

await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(REACTOR, { useClass: FusionReactor }),
      provide(COMPUTER, { useClass: ShipComputer }),
    ],
  }),
  { plugins: [devtools(), trace((event) => events.push(event))] },
);
graph(ship).edges; // -> [{ from: 'p1', to: 'p0', kind: 'required' }]
events.map((event) => event.type); // -> ['compile', 'construct', 'construct']
```

<!-- #endregion graph -->

`graph()` returns plain JSON. Ids are stable for a given set of definitions. Minifiers rename classes, so a production graph can show `t` in place of `ShipComputer`; give tokens a description, or keep class names, where names matter.

A factory's `async` in `graph()` says whether its last build returned a thenable.

## Text packs

`devtools({ text })` and `inspect(root, { text })` take the text packs `errors({ text })` takes, and read them in the same order: your packs in array order, then core's pack. Pass the pack of each package whose codes you want worded:

```ts
import { federationText } from '@nexusdi/federation/text';

const plugins = dev ? [devtools({ text: [federationText] })] : [];
```

## Notes

`devtools({ annotate })` and `inspect(root, { annotate })` take graph annotators. A `GraphAnnotator` reads the container's `BlueprintView` and returns `GraphNote`s, each a provider id and a label. Every provider in the graph has `notes`: the labels for its id, in annotator order, then in the order each annotator returned them. A provider no note names has `notes: []`, and a note for an id the view lacks is dropped. An annotator can match the shape with no import from `@nexusdi/devtools`.

<!-- #region annotate -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import type { BlueprintView } from '@nexusdi/core';
import { devtools, graph } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const shielded = (view: BlueprintView) =>
  view.providers
    .filter((p) => p.kind === 'class')
    .map((p) => ({ provider: p.id, label: 'shielded' }));

await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [provide(REACTOR, { useClass: FusionReactor })],
  }),
  { plugins: [devtools({ annotate: [shielded] })] },
);
graph(ship).providers[0]?.notes; // -> ['shielded']
```

<!-- #endregion annotate -->

## Inspect

`inspect(root)` compiles the graph `Nexus.check` compiles and builds nothing, for a CLI or a CI job. It takes the root forms `Nexus.check` takes: a module, a provider array, or `{ providers, imports, exports }`. Every provider's `async` in its graph is `null`, since nothing ran.

`inspect()` passes `options.plugins` to `Nexus.check` and adds its own formatter after them, so an `errors()` or `devtools()` in your plugins words an error first. `options.text` goes to that formatter and never to `Nexus.check`.

<!-- #region inspect -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { inspect } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Engineering] });

inspect(Meridian).modules.map((module) => module.name); // -> ['Meridian', 'Engineering']
```

<!-- #endregion inspect -->

## License

MIT
