# NEXUS_NOT_READY examples

Regions for `apps/docs/content/errors/NEXUS_NOT_READY.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError, lazy } from '@nexusdi/core';
import { provide, type NexusPlugin } from '@nexusdi/core';
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
