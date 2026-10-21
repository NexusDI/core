# How do I share tokens between a shell and its remotes? examples

Regions for `apps/docs/content/federation.mdx`. Every block runs as a test. One file holds one bundle, so each region writes the shell's copy of the contracts package and a remote's copy as two `defineContract()` calls with the same key.

<!-- #region two-copies -->

```ts @import.meta.vitest
import {
  Nexus,
  Token,
  defineModule,
  isNexusError,
  provide,
} from '@nexusdi/core';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
interface INavRoutes {
  find(sector: string): string;
}

// The shell's NAV_CHARTS, and the remote's copy from its own bundle.
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const REMOTE_NAV_CHARTS = new Token<INavCharts>('NavCharts');

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
  static deps = [REMOTE_NAV_CHARTS] as const;
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

await using ship = await Nexus.create(Meridian);
const error = await ship.load(Cartography).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors
  : [];
const codes = inner.map((e) => e.code); // -> ['NEXUS_MISSING_PROVIDER']
console.log(codes);
```

<!-- #endregion two-copies -->

<!-- #region contract -->

```ts @import.meta.vitest
import { defineContract } from '@nexusdi/federation';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}

// examples/federation-contracts/src/index.ts, the package the shell owns.
const meridian = defineContract({ key: 'meridian', version: '2.3.0' });
const NAV_CHARTS = meridian.token<INavCharts>('NavCharts');

const description = NAV_CHARTS.description; // -> 'meridian/NavCharts'
console.log(description);
```

<!-- #endregion contract -->

<!-- #region load-section -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { defineContract, federation } from '@nexusdi/federation';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
interface INavRoutes {
  find(sector: string): string;
}

// The shell's copy of the contracts package, and the remote's copy.
const meridian = defineContract({ key: 'meridian', version: '2.3.0' });
const remoteMeridian = defineContract({ key: 'meridian', version: '2.3.0' });

// The shell's contract module, global so that a loaded section sees it.
const NAV_CHARTS = meridian.token<INavCharts>('NavCharts');
const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, { useValue: { plot: (to) => ({ to, heading: 42 }) } }),
  ],
  exports: [NAV_CHARTS],
  global: true,
});
const Meridian = defineModule({ name: 'Meridian', imports: [Tactical] });

// The remote's section, which reads its own copy of NAV_CHARTS.
const NAV_ROUTES = new Token<INavRoutes>('NavRoutes');
class SectorRoutes implements INavRoutes {
  static deps = [remoteMeridian.token<INavCharts>('NavCharts')] as const;
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
const route = ship.get(NAV_ROUTES).find('Kepler-442b'); // -> 'Kepler-442b: heading 42'
console.log(route);
```

<!-- #endregion load-section -->

<!-- #region drift -->

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

// The remote was built against the next minor of the contract.
const meridian = defineContract({ key: 'meridian', version: '2.3.0' });
const remoteMeridian = defineContract({ key: 'meridian', version: '2.4.0' });

const NAV_CHARTS = meridian.token<INavCharts>('NavCharts');
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
  static deps = [remoteMeridian.token<INavCharts>('NavCharts')] as const;
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
const message = inner?.message.split('\n')[0]; // -> '[NEXUS_CONTRACT_VERSION] meridian/NavCharts is needed at 2.4.0, and the provider has 2.3.0.'
console.log(message);
```

<!-- #endregion drift -->

<!-- #region shared -->

```ts @import.meta.vitest
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const versionOf = (name: string): string =>
  (require(`${name}/package.json`) as { version: string }).version;

// Every @nexusdi package peers on core's exact version, so the two
// @nexusdi entries take core's version.
const react = versionOf('react');
const core = versionOf('@nexusdi/core');

// The `shared` object the shell and every remote pass to their
// ModuleFederationPlugin.
const shared = {
  react: { singleton: true, requiredVersion: react },
  'react-dom': { singleton: true, requiredVersion: react },
  '@nexusdi/core': { singleton: true, requiredVersion: core },
  '@nexusdi/react': { singleton: true, requiredVersion: core },
};

const singleton = shared['@nexusdi/core'].singleton; // -> true
console.log(singleton);
const installed =
  shared['@nexusdi/core'].requiredVersion === versionOf('@nexusdi/core'); // -> true
console.log(installed);
```

<!-- #endregion shared -->
