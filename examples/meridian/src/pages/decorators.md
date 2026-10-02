# How do I write providers with decorators? examples

Regions for `apps/docs/content/decorators.mdx`. Every block runs as a test.

<!-- #region injectable -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { Injectable } from '@nexusdi/decorators';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  status(): string;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

@Injectable({ deps: [REACTOR] })
class QuantumComputer implements IShipComputer {
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `ShipComputer online. Reactor output ${this.reactor.output} GW.`;
  }
}

await using ship = await Nexus.create([
  provide(REACTOR, { useClass: FusionReactor }),
  provide(COMPUTER, { useClass: QuantumComputer }),
]);
const status = ship.get(COMPUTER).status(); // -> 'ShipComputer online. Reactor output 1.21 GW.'
console.log(status);
```

<!-- #endregion injectable -->

<!-- #region inject-accessor -->

```ts @import.meta.vitest
import { Nexus, Token, optional, provide } from '@nexusdi/core';
import { Inject } from '@nexusdi/decorators';

interface INavCharts {
  plot(to: string): string;
}
interface ISubspaceLink {
  readonly frequency: number;
}
interface IBridge {
  course(to: string): string;
  hailing(): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const BRIDGE = new Token<IBridge>('Bridge');

class Bridge implements IBridge {
  @Inject(NAV_CHARTS) accessor charts!: INavCharts;
  @Inject(optional(SUBSPACE_LINK)) accessor link!: ISubspaceLink | undefined;

  course(to: string) {
    return this.charts.plot(to);
  }
  hailing() {
    return this.link === undefined ? 'no link' : `${this.link.frequency} MHz`;
  }
}

await using ship = await Nexus.create([
  provide(NAV_CHARTS, {
    useValue: { plot: (to: string) => `course to ${to}` },
  }),
  provide(BRIDGE, { useClass: Bridge }),
]);
const course = ship.get(BRIDGE).course('Kepler-442b'); // -> 'course to Kepler-442b'
console.log(course);
const hail = ship.get(BRIDGE).hailing(); // -> 'no link'
console.log(hail);
```

<!-- #endregion inject-accessor -->

<!-- #region module-class -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { Injectable, Module } from '@nexusdi/decorators';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  status(): string;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

@Injectable({ deps: [REACTOR] })
class QuantumComputer implements IShipComputer {
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `ShipComputer online. Reactor output ${this.reactor.output} GW.`;
  }
}

@Module({
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
  ],
  exports: [COMPUTER],
})
class Engineering {}

@Module({ imports: [Engineering] })
class Command {}

await using ship = await Nexus.create(Command);
const status = ship.get(COMPUTER).status(); // -> 'ShipComputer online. Reactor output 1.21 GW.'
console.log(status);
const hidden = ship.has(REACTOR); // -> false
console.log(hidden);
```

<!-- #endregion module-class -->

<!-- #region missing-deps -->

```ts @import.meta.vitest
import { Nexus, Token, isNexusError, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  status(): string;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

// The @Injectable line is gone, so nothing declares the constructor's deps.
class QuantumComputer implements IShipComputer {
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `ShipComputer online. Reactor output ${this.reactor.output} GW.`;
  }
}

const error = await Nexus.create([
  provide(REACTOR, { useClass: FusionReactor }),
  provide(COMPUTER, { useClass: QuantumComputer }),
]).catch((caught: unknown) => caught);
const errors = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors
  : [];
const codes = errors.map((inner) => inner.code); // -> ['NEXUS_MISSING_DEPS']
console.log(codes);
```

<!-- #endregion missing-deps -->
