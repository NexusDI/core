# Decorator examples

## All three decorators

`@Injectable`, `@Inject` and `@Module` in one module, with an optional field.

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
