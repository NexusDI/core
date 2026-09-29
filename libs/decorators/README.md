# @nexusdi/decorators

`@Injectable`, `@Inject` and `@Module` declare NexusDI classes and modules with standard (TC39) decorators.

```bash
npm install @nexusdi/decorators @nexusdi/core
```

The version of `@nexusdi/decorators` must equal the version of `@nexusdi/core`.

## Decorators

Decorators are optional. `provide()`, `static deps` and `defineModule()` need no compiler flag. `@Injectable`, `@Inject` and `@Module`, from `@nexusdi/decorators`, are standard (TC39) decorators, so they need a toolchain that compiles standard decorators: tsc, TypeScript 7, esbuild, SWC, Babel, Bun, Deno and Vite with its Babel plugin. Vite on its own and Node's type stripping cannot run them. A project that keeps `experimentalDecorators` for another library uses `provide()`, `static deps` and `defineModule()`, and the decorators throw `NEXUS_LEGACY_DECORATORS` under that flag.

The decorators write the same definitions `provide()` and `defineModule()` build, through core's `declareClass`, `declareProperty` and `declareModuleClass`, which a decorator library of your own can call too. A `useClass` binding reads the deps `@Injectable` declares.

<!-- #region decorators -->

```ts @import.meta.vitest
import { Nexus, Token, optional, provide } from '@nexusdi/core';
import { Inject, Injectable, Module } from '@nexusdi/decorators';

interface IReactorCore {
  readonly output: number;
}
interface INavCharts {
  plot(to: string): string;
}
interface ISubspaceLink {
  readonly frequency: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
interface IBridge {
  readonly charts: INavCharts;
  readonly link: ISubspaceLink | undefined;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const BRIDGE = new Token<IBridge>('Bridge');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

@Injectable({ deps: [REACTOR] })
class ShipComputer implements IShipComputer {
  constructor(readonly reactor: IReactorCore) {}
}

class Bridge implements IBridge {
  @Inject(NAV_CHARTS) accessor charts!: INavCharts;
  @Inject(optional(SUBSPACE_LINK)) accessor link!: ISubspaceLink | undefined;
}

@Module({
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: ShipComputer }),
    provide(BRIDGE, { useClass: Bridge }),
    provide(NAV_CHARTS, {
      useValue: { plot: (to: string) => `course to ${to}` },
    }),
  ],
  exports: [COMPUTER, BRIDGE],
})
class Command {}

await using ship = await Nexus.create(Command);
ship.get(COMPUTER).reactor.output; // -> 1.21
ship.get(BRIDGE).charts.plot('Kepler-442b'); // -> 'course to Kepler-442b'
ship.get(BRIDGE).link; // -> undefined
```

<!-- #endregion decorators -->

`@Module` classes are not configurable; configurable modules use `defineModule`.

## License

MIT
