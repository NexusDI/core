# Modules

## Interfaces and tokens

A `Token<T>` names an interface, and `provide()` binds it to a class, a value or a factory.

<!-- #region interfaces-and-tokens -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface INavCharts {
  plot(to: string): string;
}
interface IShipComputer {
  course(to: string): string;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class ShipComputer implements IShipComputer {
  static deps = [REACTOR, NAV_CHARTS] as const;
  constructor(
    readonly reactor: IReactorCore,
    readonly charts: INavCharts,
  ) {}
  course(to: string) {
    return this.charts.plot(to);
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(NAV_CHARTS, {
      useFactory: async () => ({ plot: (to: string) => `course to ${to}` }),
    }),
    provide(COMPUTER, { useClass: ShipComputer }),
  ],
  exports: [COMPUTER],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Engineering] });

await using ship = await Nexus.create(Meridian);
ship.get(COMPUTER).course('Kepler-442b'); // -> 'course to Kepler-442b'
ship.has(REACTOR); // -> false
```

<!-- #endregion interfaces-and-tokens -->

## Visibility

A module sees its own providers and the exports of the modules it imports.

<!-- #region modules -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import type { NexusError } from '@nexusdi/core';

interface ISubspaceLink {
  readonly frequency: number;
}
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
class SubspaceRelay implements ISubspaceLink {
  readonly frequency = 1420;
}
const Comms = defineModule({
  name: 'Comms',
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
});

await using ship = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [Comms] }),
);
ship.has(SUBSPACE_LINK); // -> false
ship.get(SUBSPACE_LINK, { module: Comms }).frequency; // -> 1420

let code = '';
try {
  ship.get(SUBSPACE_LINK);
} catch (error) {
  code = (error as NexusError).code;
}
code; // -> 'NEXUS_NOT_VISIBLE'
```

<!-- #endregion modules -->

## Loading once

`loadOnce(container)` returns a load function that calls `container.load` once for each module and granted set.

<!-- #region load-once -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, loadOnce, provide } from '@nexusdi/core';

interface ISurveyDrone {
  readonly serial: number;
}
const DRONE = new Token<ISurveyDrone>('SurveyDrone');
let launched = 0;
class ScoutDrone implements ISurveyDrone {
  readonly serial = ++launched;
}
const Survey = defineModule({
  name: 'Survey',
  providers: [provide(DRONE, { useClass: ScoutDrone })],
  exports: [DRONE],
});

await using ship = await Nexus.create(defineModule({ name: 'Meridian' }));
const load = loadOnce(ship);
const first = load(Survey);
const second = load(Survey);
await Promise.all([first, second]);
first === second; // -> true
launched; // -> 1
loadOnce(ship) === load; // -> true
```

<!-- #endregion load-once -->

## Splitting a load entry

`splitLoadEntry(entry)` returns the module and the granted modules of a `LoadEntry`. A tool that loads entries calls `load(module, { imports })` with the parts, and a value that is neither form comes back as the module, so `load()` reports it.

<!-- #region split-load-entry -->

```ts @import.meta.vitest
import { defineModule, splitLoadEntry } from '@nexusdi/core';

const Engineering = defineModule({ name: 'Engineering' });
const Survey = defineModule({ name: 'Survey' });

const bare = splitLoadEntry(Survey);
bare.module === Survey; // -> true
bare.imports.length; // -> 0

const granted = splitLoadEntry({ module: Survey, imports: [Engineering] });
granted.module === Survey; // -> true
granted.imports[0] === Engineering; // -> true
```

<!-- #endregion split-load-entry -->

## Async options

`forRootAsync({ useFactory, deps })` computes a module's options at startup.

<!-- #region configurable-module-async -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface ICommsOptions {
  readonly frequency: number;
}
interface ISubspaceLink {
  readonly frequency: number;
}
interface IVault {
  read(key: string): Promise<number>;
}
const COMMS_OPTIONS = new Token<ICommsOptions>('CommsOptions');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const VAULT = new Token<IVault>('Vault');
class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;
  readonly frequency: number;
  constructor(options: ICommsOptions) {
    this.frequency = options.frequency;
  }
}
class MemoryVault implements IVault {
  async read(key: string) {
    return key === 'comms/frequency' ? 1701 : 0;
  }
}

const Secrets = defineModule({
  name: 'Secrets',
  global: true,
  providers: [provide(VAULT, { useClass: MemoryVault })],
  exports: [VAULT],
});
const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});

await using ship = await Nexus.create(
  defineModule({
    name: 'Science',
    imports: [
      Secrets,
      Comms.forRootAsync({
        useFactory: async (vault) => ({
          frequency: await vault.read('comms/frequency'),
        }),
        deps: [VAULT],
      }),
    ],
  }),
);
ship.get(SUBSPACE_LINK).frequency; // -> 1701
```

<!-- #endregion configurable-module-async -->
