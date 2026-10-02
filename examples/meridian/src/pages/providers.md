# Providers examples

Regions for `apps/docs/content/providers.mdx`. Every block runs as a test.

<!-- #region static-deps -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

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
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `Reactor output ${this.reactor.output} GW.`;
  }
}

await using ship = await Nexus.create([
  provide(REACTOR, { useClass: FusionReactor }),
  provide(COMPUTER, { useClass: QuantumComputer }),
]);

const status = ship.get(COMPUTER).status(); // -> 'Reactor output 1.21 GW.'
console.log(status);
```

<!-- #endregion static-deps -->

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
class QuantumComputer implements IShipComputer {
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `Reactor output ${this.reactor.output} GW.`;
  }
}

const error = await Nexus.create([
  provide(REACTOR, { useClass: FusionReactor }),
  provide(COMPUTER, { useClass: QuantumComputer }),
]).catch((caught: unknown) => caught);
if (!isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')) throw error;

const first = error.errors[0]?.message; // -> '[NEXUS_MISSING_DEPS] token=ShipComputer module=root arity=1 useClass=QuantumComputer. https://nexus.js.org/errors/NEXUS_MISSING_DEPS'
console.log(first);
```

<!-- #endregion missing-deps -->

<!-- #region explicit-deps -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

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

// A class from a package: you cannot add `static deps` to it.
class VendorComputer implements IShipComputer {
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `Vendor computer. Reactor output ${this.reactor.output} GW.`;
  }
}

await using ship = await Nexus.create([
  provide(REACTOR, { useClass: FusionReactor }),
  provide(COMPUTER, { useClass: VendorComputer, deps: [REACTOR] }),
]);

const status = ship.get(COMPUTER).status(); // -> 'Vendor computer. Reactor output 1.21 GW.'
console.log(status);
```

<!-- #endregion explicit-deps -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const SPARE = new Token<IReactorCore>('SpareReactor');
const COMPUTER = new Token<{ output: number }>('ShipComputer');
class QuantumComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
  get output() {
    return this.reactor.output;
  }
}
await using ship = await Nexus.create([
  provide(REACTOR, { useValue: { output: 1.21 } }),
  provide(SPARE, { useValue: { output: 0.5 } }),
  provide(COMPUTER, { useClass: QuantumComputer, deps: [SPARE] }),
]);
const output = ship.get(COMPUTER).output; // -> 0.5
console.log(output);
```

<!-- #region factories -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

interface ISubspaceLink {
  readonly frequency: number;
}
interface INavCharts {
  plot(target: string): string;
}

const FREQUENCY = new Token<number>('Frequency');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

await using ship = await Nexus.create([
  provide(FREQUENCY, { useValue: 1420 }),
  provide(SUBSPACE_LINK, {
    useFactory: (frequency) => ({ frequency }),
    deps: [FREQUENCY],
  }),
  provide(NAV_CHARTS, {
    useFactory: async (link) => {
      await Promise.resolve(); // stands in for a download over the link
      return { plot: (target) => `course to ${target} on ${link.frequency}` };
    },
    deps: [SUBSPACE_LINK],
  }),
]);

const course = ship.get(NAV_CHARTS).plot('Kepler-442b'); // -> 'course to Kepler-442b on 1420'
console.log(course);
```

<!-- #endregion factories -->

<!-- #region alias -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

interface IShipComputer {
  status(): string;
}

const COMPUTER = new Token<IShipComputer>('ShipComputer');
const NAV_COMPUTER = new Token<IShipComputer>('NavComputer');

class QuantumComputer implements IShipComputer {
  status() {
    return 'ShipComputer online.';
  }
}

await using ship = await Nexus.create([
  provide(COMPUTER, { useClass: QuantumComputer }),
  provide(NAV_COMPUTER, { useExisting: COMPUTER }),
]);

const shared = ship.get(NAV_COMPUTER) === ship.get(COMPUTER); // -> true
console.log(shared);
```

<!-- #endregion alias -->

<!-- #region optional -->

```ts @import.meta.vitest
import { Nexus, Token, optional, provide } from '@nexusdi/core';

interface ISubspaceLink {
  send(message: string): string;
}
interface IDiagnosticsPanel {
  report(): string;
}

const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const DIAGNOSTICS_PANEL = new Token<IDiagnosticsPanel>('DiagnosticsPanel');

class StatusBoard implements IDiagnosticsPanel {
  static deps = [optional(SUBSPACE_LINK)] as const;
  constructor(private readonly link: ISubspaceLink | undefined) {}
  report() {
    return this.link === undefined
      ? 'all systems nominal, held aboard'
      : this.link.send('all systems nominal');
  }
}

await using ship = await Nexus.create([
  provide(DIAGNOSTICS_PANEL, { useClass: StatusBoard }),
]);

const report = ship.get(DIAGNOSTICS_PANEL).report(); // -> 'all systems nominal, held aboard'
console.log(report);
```

<!-- #endregion optional -->

<!-- #region defaults -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}

const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

const backupCell: IReactorCore = { output: 0.2 };

class QuantumComputer implements IShipComputer {
  constructor(readonly reactor: IReactorCore = backupCell) {}
}

await using ship = await Nexus.create([
  provide(REACTOR, { useValue: { output: 1.21 } }),
  provide(COMPUTER, { useClass: QuantumComputer }),
]);

const output = ship.get(COMPUTER).reactor.output; // -> 0.2
console.log(output);
```

<!-- #endregion defaults -->

<!-- #region defaults-fixed -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}

const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

const backupCell: IReactorCore = { output: 0.2 };

class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore = backupCell) {}
}

await using ship = await Nexus.create([
  provide(REACTOR, { useValue: { output: 1.21 } }),
  provide(COMPUTER, { useClass: QuantumComputer }),
]);

const output = ship.get(COMPUTER).reactor.output; // -> 1.21
console.log(output);
```

<!-- #endregion defaults-fixed -->
