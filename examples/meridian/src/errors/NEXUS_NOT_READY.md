# NEXUS_NOT_READY examples

Regions for `apps/docs/content/errors/NEXUS_NOT_READY.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import {
  Nexus,
  Token,
  defineModule,
  isNexusError,
  lazy,
  provide,
  type NexusPlugin,
} from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface IPowerRouter {
  divert(): number;
}
interface IShieldGrid {
  draw(): number;
}
const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');
const SHIELD_GRID = new Token<IShieldGrid>('ShieldGrid');

class PlasmaRouter implements IPowerRouter {
  static deps = [lazy(SHIELD_GRID)] as const;
  private readonly level: number;
  constructor(shields: () => IShieldGrid) {
    // The thunk runs inside the constructor, before ShieldGrid exists.
    this.level = shields().draw();
  }
  divert() {
    return this.level;
  }
}
class DeflectorGrid implements IShieldGrid {
  static deps = [POWER_ROUTER] as const;
  constructor(readonly router: IPowerRouter) {}
  draw() {
    return 0.4;
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(POWER_ROUTER, { useClass: PlasmaRouter }),
    provide(SHIELD_GRID, { useClass: DeflectorGrid }),
  ],
});

const startup = (plugins: NexusPlugin[]) =>
  Nexus.create(Engineering, { plugins }).catch((error: unknown) => error);

const thin = await startup([]);
if (!isNexusError(thin, 'NEXUS_PROVIDER_FAILED')) throw thin;
const line = isNexusError(thin.cause) ? thin.cause.message : null; // -> '[NEXUS_NOT_READY] owner=PowerRouter target=ShieldGrid. https://nexus.js.org/errors/NEXUS_NOT_READY'
console.log(line);

const full = await startup([errors()]);
if (!isNexusError(full, 'NEXUS_PROVIDER_FAILED')) throw full;
const text = isNexusError(full.cause) ? full.cause.message.split('\n') : null; // -> ['[NEXUS_NOT_READY] PowerRouter called its lazy(ShieldGrid) thunk before ShieldGrid was ready.', "  Fix: call the thunk after startup, from a method, and not from a constructor, a factory's continuation or onInit."]
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region reproduce-collector -->

```ts @import.meta.vitest
import {
  MultiToken,
  Nexus,
  Token,
  all,
  defineModule,
  isNexusError,
  lazy,
  provide,
} from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface IPowerRouter {
  readonly online: boolean;
}
interface IPowerConsumer {
  readonly name: string;
}
const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');
const POWER_CONSUMERS = new MultiToken<IPowerConsumer>('PowerConsumers');

class PlasmaRouter implements IPowerRouter {
  static deps = [lazy(all(POWER_CONSUMERS))] as const;
  readonly online: boolean;
  constructor(consumers: () => IPowerConsumer[]) {
    // The thunk runs inside the constructor, before ShieldGrid exists.
    this.online = consumers().length > 0;
  }
}
class ShieldGrid implements IPowerConsumer {
  static deps = [POWER_ROUTER] as const;
  readonly name = 'shields';
  constructor(readonly router: IPowerRouter) {}
}

const error = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(POWER_ROUTER, { useClass: PlasmaRouter }),
      provide(POWER_CONSUMERS, { useClass: ShieldGrid }),
    ],
  }),
  { plugins: [errors()] },
).catch((caught: unknown) => caught);
if (!isNexusError(error, 'NEXUS_PROVIDER_FAILED')) throw error;
const cause = error.cause;
const who = isNexusError(cause, 'NEXUS_NOT_READY') ? cause.contributor : null; // -> 'ShieldGrid (module Engineering)'
console.log(who);
const text = isNexusError(cause) ? cause.message.split('\n')[0] : null; // -> '[NEXUS_NOT_READY] PowerRouter called its lazy(all(PowerConsumers)) thunk before the contribution ShieldGrid (module Engineering) was ready.'
console.log(text);
```

<!-- #endregion reproduce-collector -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, lazy, provide } from '@nexusdi/core';

interface IPowerRouter {
  divert(): number;
}
interface IShieldGrid {
  draw(): number;
}
const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');
const SHIELD_GRID = new Token<IShieldGrid>('ShieldGrid');

class PlasmaRouter implements IPowerRouter {
  static deps = [lazy(SHIELD_GRID)] as const;
  constructor(private readonly shields: () => IShieldGrid) {}
  divert() {
    return this.shields().draw();
  }
}
class DeflectorGrid implements IShieldGrid {
  static deps = [POWER_ROUTER] as const;
  constructor(readonly router: IPowerRouter) {}
  draw() {
    return 0.4;
  }
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(POWER_ROUTER, { useClass: PlasmaRouter }),
      provide(SHIELD_GRID, { useClass: DeflectorGrid }),
    ],
  }),
);
const diverted = ship.get(POWER_ROUTER).divert(); // -> 0.4
console.log(diverted);
```

<!-- #endregion fix -->
