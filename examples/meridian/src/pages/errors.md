# Errors examples

Regions for `apps/docs/content/errors/index.mdx`. Every block runs as a test.

<!-- #region blueprint -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
interface INavCharts {
  plot(to: string): string;
}
interface ISurveyDrone {
  readonly charts: INavCharts;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
}
class ScoutDrone implements ISurveyDrone {
  static deps = [NAV_CHARTS] as const;
  constructor(readonly charts: INavCharts) {}
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(COMPUTER, { useClass: QuantumComputer }),
    provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' }),
  ],
});

const error = await Nexus.create(Engineering).catch(
  (caught: unknown) => caught,
);
const code = isNexusError(error) ? error.code : null; // -> 'NEXUS_BLUEPRINT_INVALID'
console.log(code);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors
  : [];
const missing = inner.filter((each) =>
  isNexusError(each, 'NEXUS_MISSING_PROVIDER'),
);
const tokens = missing.map((each) => each.token); // -> ['ReactorCore', 'NavCharts']
console.log(tokens);
```

<!-- #endregion blueprint -->

<!-- #region one-line -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(COMPUTER, { useClass: QuantumComputer })],
});

const error = await Nexus.create(Engineering).catch(
  (caught: unknown) => caught,
);
if (!isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')) throw error;
const missing = error.errors[0];
const message = missing?.message; // -> '[NEXUS_MISSING_PROVIDER] token=ReactorCore requester=ShipComputer module=Engineering. https://nexus.js.org/errors/NEXUS_MISSING_PROVIDER'
console.log(message);
```

<!-- #endregion one-line -->

<!-- #region full-text -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(COMPUTER, { useClass: QuantumComputer })],
});

const error = await Nexus.create(Engineering, { plugins: [errors()] }).catch(
  (caught: unknown) => caught,
);
if (!isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')) throw error;
const missing = error.errors[0];
const lines = missing?.message.split('\n'); // -> ['[NEXUS_MISSING_PROVIDER] ShipComputer (module Engineering) depends on ReactorCore, but no provider of ReactorCore is visible in Engineering.', '  Fix: provide ReactorCore in Engineering or in a module Engineering imports.']
console.log(lines?.join('\n'));
```

<!-- #endregion full-text -->

<!-- #region provider-failed -->

```ts @import.meta.vitest
import { Nexus, Token, isNexusError, provide } from '@nexusdi/core';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

const error = await Nexus.create([
  provide(NAV_CHARTS, {
    useFactory: async (): Promise<INavCharts> => {
      throw new Error('chart archive unreachable');
    },
  }),
]).catch((caught: unknown) => caught);
const code = isNexusError(error) ? error.code : null; // -> 'NEXUS_PROVIDER_FAILED'
console.log(code);
const failure = isNexusError(error, 'NEXUS_PROVIDER_FAILED') ? error : null;
const token = failure?.token; // -> 'NavCharts'
console.log(token);
const failed = isNexusError(error) ? error.cause : undefined;
const cause = failed instanceof Error ? failed.message : null; // -> 'chart archive unreachable'
console.log(cause);
```

<!-- #endregion provider-failed -->

<!-- #region log-fields -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';

interface INavCharts {
  plot(to: string): string;
}
interface IShipComputer {
  readonly charts: INavCharts;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, {
      useValue: { plot: (to: string) => `course to ${to}` },
    }),
  ],
});

class QuantumComputer implements IShipComputer {
  static deps = [NAV_CHARTS] as const;
  constructor(readonly charts: INavCharts) {}
}

const error = await Nexus.create(
  defineModule({
    name: 'Engineering',
    imports: [Tactical],
    providers: [provide(COMPUTER, { useClass: QuantumComputer })],
  }),
).catch((caught: unknown) => caught);
if (!isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')) throw error;
const missing = error.errors[0];
if (missing === undefined) throw error;
const fields = { ...missing, code: missing.code }; // -> { token: 'NavCharts', requester: 'ShipComputer', module: 'Engineering', entry: null, nearMisses: [], code: 'NEXUS_MISSING_PROVIDER' }
console.log(JSON.stringify(fields));
```

<!-- #endregion log-fields -->
