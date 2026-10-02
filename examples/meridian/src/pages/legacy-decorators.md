# How do I use NexusDI in a project that keeps experimentalDecorators? examples

Regions for `apps/docs/content/legacy-decorators.mdx`. Every block runs as a test.

<!-- #region legacy-call -->

```ts @import.meta.vitest
import { isNexusError } from '@nexusdi/core';
import { Injectable } from '@nexusdi/decorators';

class QuantumComputer {}

// Under experimentalDecorators, TypeScript calls a class decorator with the
// class alone. This line makes the same call by hand.
const legacyCall = Injectable({ deps: [] }) as unknown as (
  target: object,
) => void;

let message = '';
try {
  legacyCall(QuantumComputer);
} catch (error) {
  if (!isNexusError(error, 'NEXUS_LEGACY_DECORATORS')) throw error;
  message = error.message;
}
const lines = message.split('\n'); // -> ["[NEXUS_LEGACY_DECORATORS] @Injectable was called as a legacy decorator, and NexusDI's decorators are standard (TC39) decorators.", '  Fix: remove experimentalDecorators from tsconfig, or register the class with provide() and defineModule().']
console.log(lines);
```

<!-- #endregion legacy-call -->

<!-- #region without-decorators -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

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
    return `ShipComputer online. Reactor output ${this.reactor.output} GW.`;
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
  ],
  exports: [COMPUTER],
});

await using ship = await Nexus.create(Engineering);
const status = ship.get(COMPUTER).status(); // -> 'ShipComputer online. Reactor output 1.21 GW.'
console.log(status);
```

<!-- #endregion without-decorators -->

<!-- #region class-from-package -->

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
// A class from another package: it carries no static deps, and you cannot edit it.
class VendorComputer implements IShipComputer {
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `VendorComputer online. Reactor output ${this.reactor.output} GW.`;
  }
}

await using ship = await Nexus.create([
  provide(REACTOR, { useClass: FusionReactor }),
  provide(COMPUTER, { useClass: VendorComputer, deps: [REACTOR] }),
]);
const status = ship.get(COMPUTER).status(); // -> 'VendorComputer online. Reactor output 1.21 GW.'
console.log(status);
```

<!-- #endregion class-from-package -->

<!-- #region deps-missing -->

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
// No static deps and no deps option: nothing says what the constructor takes.
class VendorComputer implements IShipComputer {
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `VendorComputer online. Reactor output ${this.reactor.output} GW.`;
  }
}

const error = await Nexus.create([
  provide(REACTOR, { useClass: FusionReactor }),
  provide(COMPUTER, { useClass: VendorComputer }),
]).catch((caught: unknown) => caught);
const code = isNexusError(error) ? error.code : ''; // -> 'NEXUS_BLUEPRINT_INVALID'
const errors = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors
  : [];
const inner = errors.map((item) => item.code); // -> ['NEXUS_MISSING_DEPS']
console.log(code, inner);
```

<!-- #endregion deps-missing -->
