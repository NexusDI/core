# How do I register a plugin? examples

Regions for `apps/docs/content/plugins.mdx`. Every block runs as a test.

<!-- #region register -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule } from '@nexusdi/core';
import { isNexusError, provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface INavCharts {
  plot(to: string): string;
}
interface IShipComputer {
  course(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class QuantumComputer implements IShipComputer {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  course(to: string) {
    return this.charts.plot(to);
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(COMPUTER, { useClass: QuantumComputer })],
});

const error = await Nexus.create(Engineering, { plugins: [errors()] }).catch(
  (caught: unknown) => caught,
);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : null;
const first = inner?.message ?? '';
const lines = first.split('\n'); // -> ['[NEXUS_MISSING_PROVIDER] ShipComputer (module Engineering) depends on NavCharts, but no provider of NavCharts is visible in Engineering.', '  Fix: provide NavCharts in Engineering or in a module Engineering imports.']
console.log(first);
```

<!-- #endregion register -->

<!-- #region without-plugin -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule } from '@nexusdi/core';
import { isNexusError, provide } from '@nexusdi/core';

interface INavCharts {
  plot(to: string): string;
}
interface IShipComputer {
  course(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class QuantumComputer implements IShipComputer {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  course(to: string) {
    return this.charts.plot(to);
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(COMPUTER, { useClass: QuantumComputer })],
});

const error = await Nexus.create(Engineering).catch(
  (caught: unknown) => caught,
);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : null;
const first = inner?.message; // -> '[NEXUS_MISSING_PROVIDER] token=NavCharts requester=ShipComputer module=Engineering. https://nexus.js.org/errors/NEXUS_MISSING_PROVIDER'
console.log(first);
```

<!-- #endregion without-plugin -->

<!-- #region development-only -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { devtools, graph } from '@nexusdi/devtools';

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
});

const development = process.env.NODE_ENV !== 'production';

await using ship = await Nexus.create(Engineering, {
  plugins: development ? [devtools()] : [],
});
const providers = graph(ship).providers.filter(
  (provider) => !provider.internal,
);
const tokens = providers.map((provider) => provider.token); // -> ['ReactorCore']
console.log(tokens);
```

<!-- #endregion development-only -->

<!-- #region twice -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule } from '@nexusdi/core';
import { isNexusError, provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

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
});

const error = await Nexus.create(Engineering, {
  plugins: [errors(), errors()],
}).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : null;
const code = inner?.code; // -> 'NEXUS_PLUGIN_INVALID'
console.log(code);
const message = inner?.message; // -> '[NEXUS_PLUGIN_INVALID] nexus:errors has the name of an earlier plugin; each plugin needs its own name.'
console.log(message);
```

<!-- #endregion twice -->

<!-- #region version -->

```ts @import.meta.vitest
import { NEXUS_PLUGIN_API, Nexus, Token } from '@nexusdi/core';
import { defineModule, isNexusError, provide } from '@nexusdi/core';
import type { NexusPlugin } from '@nexusdi/core';

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
});

const api = NEXUS_PLUGIN_API; // -> 1
console.log(api);
const future: NexusPlugin = { name: 'acme:future', apiVersion: 2 };

const error = await Nexus.create(Engineering, { plugins: [future] }).catch(
  (caught: unknown) => caught,
);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : null;
const message = inner?.message; // -> '[NEXUS_PLUGIN_VERSION] plugin=acme:future apiVersion=2. https://nexus.js.org/errors/NEXUS_PLUGIN_VERSION'
console.log(message);
```

<!-- #endregion version -->

<!-- #region order -->

```ts @import.meta.vitest
import { NEXUS_PLUGIN_API, Nexus, Token } from '@nexusdi/core';
import { defineModule, isNexusError, provide } from '@nexusdi/core';
import type { NexusPlugin } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface INavCharts {
  plot(to: string): string;
}
interface IShipComputer {
  course(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
class QuantumComputer implements IShipComputer {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  course(to: string) {
    return this.charts.plot(to);
  }
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(COMPUTER, { useClass: QuantumComputer })],
});

const bridgeConsole: NexusPlugin = {
  name: 'meridian:bridge-console',
  apiVersion: NEXUS_PLUGIN_API,
  formatError: (error) =>
    error.code === 'NEXUS_MISSING_PROVIDER'
      ? { message: 'Bridge console: a provider is missing.' }
      : undefined,
};

const error = await Nexus.create(Engineering, {
  plugins: [bridgeConsole, errors()],
}).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : null;
const message = inner?.message; // -> '[NEXUS_MISSING_PROVIDER] Bridge console: a provider is missing.'
console.log(message);
```

<!-- #endregion order -->
