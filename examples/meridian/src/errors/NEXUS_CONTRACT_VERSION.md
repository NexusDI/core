# NEXUS_CONTRACT_VERSION examples

Regions for `apps/docs/content/errors/NEXUS_CONTRACT_VERSION.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import {
  Nexus,
  Token,
  defineModule,
  isNexusError,
  provide,
} from '@nexusdi/core';
import { defineContract, federation } from '@nexusdi/federation';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
interface INavRoutes {
  find(sector: string): string;
}

// The shell's copy of the contracts package, and the newer copy the
// cartography remote was built against.
const shellContract = defineContract({ key: 'meridian', version: '2.3.0' });
const remoteContract = defineContract({ key: 'meridian', version: '2.4.0' });

// The shell's contract module. It is global, because a remote cannot import
// this module object, and a loaded section sees the exports of every global
// module.
const NAV_CHARTS = shellContract.token<INavCharts>('NavCharts');
const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, { useValue: { plot: (to) => ({ to, heading: 42 }) } }),
  ],
  exports: [NAV_CHARTS],
  global: true,
});
const Meridian = defineModule({ name: 'Meridian', imports: [Tactical] });

// The remote's section, which depends on its own copy of NAV_CHARTS.
const NAV_ROUTES = new Token<INavRoutes>('NavRoutes');
class SectorRoutes implements INavRoutes {
  static deps = [remoteContract.token<INavCharts>('NavCharts')] as const;
  constructor(private readonly charts: INavCharts) {}
  find(sector: string) {
    return `${sector}: heading ${this.charts.plot(sector).heading}`;
  }
}
const Cartography = defineModule({
  name: 'Cartography',
  providers: [provide(NAV_ROUTES, { useClass: SectorRoutes })],
  exports: [NAV_ROUTES],
});

await using ship = await Nexus.create(Meridian, { plugins: [federation()] });
const error = await ship.load(Cartography).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const message = inner?.message; // -> '[NEXUS_CONTRACT_VERSION] contract=meridian/NavCharts required=2.4.0 provided=2.3.0. https://nexus.js.org/errors/NEXUS_CONTRACT_VERSION'
console.log(message);
```

<!-- #endregion reproduce -->

<!-- #region full-text -->

```ts @import.meta.vitest
import {
  Nexus,
  Token,
  defineModule,
  isNexusError,
  provide,
} from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { defineContract, federation } from '@nexusdi/federation';
import { federationText } from '@nexusdi/federation/text';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
interface INavRoutes {
  find(sector: string): string;
}

const shellContract = defineContract({ key: 'meridian', version: '2.3.0' });
const remoteContract = defineContract({ key: 'meridian', version: '2.4.0' });

const NAV_CHARTS = shellContract.token<INavCharts>('NavCharts');
const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, { useValue: { plot: (to) => ({ to, heading: 42 }) } }),
  ],
  exports: [NAV_CHARTS],
  global: true,
});
const Meridian = defineModule({ name: 'Meridian', imports: [Tactical] });

const NAV_ROUTES = new Token<INavRoutes>('NavRoutes');
class SectorRoutes implements INavRoutes {
  static deps = [remoteContract.token<INavCharts>('NavCharts')] as const;
  constructor(private readonly charts: INavCharts) {}
  find(sector: string) {
    return `${sector}: heading ${this.charts.plot(sector).heading}`;
  }
}
const Cartography = defineModule({
  name: 'Cartography',
  providers: [provide(NAV_ROUTES, { useClass: SectorRoutes })],
  exports: [NAV_ROUTES],
});

await using ship = await Nexus.create(Meridian, {
  plugins: [federation(), errors({ text: [federationText] })],
});
const error = await ship.load(Cartography).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const lines = inner?.message.split('\n'); // -> ['[NEXUS_CONTRACT_VERSION] meridian/NavCharts is needed at 2.4.0, and the provider has 2.3.0.', '  Fix: build the provider against 2.4.0 or a newer 2.x, or build the dependent against 2.3.0.']
console.log(lines?.join('\n'));
```

<!-- #endregion full-text -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { defineContract, federation } from '@nexusdi/federation';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
interface INavRoutes {
  find(sector: string): string;
}

// The shell now provides the contract at 2.4.0, the version the remote needs.
const shellContract = defineContract({ key: 'meridian', version: '2.4.0' });
const remoteContract = defineContract({ key: 'meridian', version: '2.4.0' });

const NAV_CHARTS = shellContract.token<INavCharts>('NavCharts');
const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, { useValue: { plot: (to) => ({ to, heading: 42 }) } }),
  ],
  exports: [NAV_CHARTS],
  global: true,
});
const Meridian = defineModule({ name: 'Meridian', imports: [Tactical] });

const NAV_ROUTES = new Token<INavRoutes>('NavRoutes');
class SectorRoutes implements INavRoutes {
  static deps = [remoteContract.token<INavCharts>('NavCharts')] as const;
  constructor(private readonly charts: INavCharts) {}
  find(sector: string) {
    return `${sector}: heading ${this.charts.plot(sector).heading}`;
  }
}
const Cartography = defineModule({
  name: 'Cartography',
  providers: [provide(NAV_ROUTES, { useClass: SectorRoutes })],
  exports: [NAV_ROUTES],
});

await using ship = await Nexus.create(Meridian, { plugins: [federation()] });
await ship.load(Cartography);
const course = ship.get(NAV_ROUTES).find('Kepler-442b'); // -> 'Kepler-442b: heading 42'
console.log(course);
```

<!-- #endregion fix -->
