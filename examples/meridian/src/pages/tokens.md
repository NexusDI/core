# Tokens and interfaces examples

Regions for `apps/docs/content/tokens.mdx`. Every block runs as a test.

<!-- #region interface-token -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

interface INavCharts {
  plot(target: string): string;
}

const NAV_CHARTS = new Token<INavCharts>('NavCharts');

const starCharts: INavCharts = {
  plot: (target) => `course to ${target}`,
};

await using ship = await Nexus.create([
  provide(NAV_CHARTS, { useValue: starCharts }),
]);

const course = ship.get(NAV_CHARTS).plot('Kepler-442b'); // -> 'course to Kepler-442b'
console.log(course);
```

<!-- #endregion interface-token -->

<!-- #region identity -->

```ts @import.meta.vitest
import { Nexus, Token, isNexusError, provide } from '@nexusdi/core';

interface INavCharts {
  plot(target: string): string;
}

const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const BACKUP_CHARTS = new Token<INavCharts>('NavCharts');

await using ship = await Nexus.create([
  provide(NAV_CHARTS, {
    useValue: { plot: (target) => `course to ${target}` },
  }),
]);

const same = NAV_CHARTS === BACKUP_CHARTS; // -> false
console.log(same);

const provided = ship.has(BACKUP_CHARTS); // -> false
console.log(provided);

let code: string | null = null;
try {
  ship.get(BACKUP_CHARTS);
} catch (error) {
  if (!isNexusError(error)) throw error;
  code = error.code;
}
const missing = code; // -> 'NEXUS_MISSING_PROVIDER'
console.log(missing);
```

<!-- #endregion identity -->

<!-- #region swap-reactor -->

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

class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `Reactor output ${this.reactor.output} GW.`;
  }
}

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const fakeReactor: IReactorCore = { output: 0 };

async function statusWith(reactor: IReactorCore) {
  await using ship = await Nexus.create([
    provide(REACTOR, { useValue: reactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
  ]);
  return ship.get(COMPUTER).status();
}

const real = await statusWith(new FusionReactor()); // -> 'Reactor output 1.21 GW.'
console.log(real);

const fake = await statusWith(fakeReactor); // -> 'Reactor output 0 GW.'
console.log(fake);
```

<!-- #endregion swap-reactor -->
