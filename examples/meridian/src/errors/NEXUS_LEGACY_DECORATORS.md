# NEXUS_LEGACY_DECORATORS examples

Regions for `apps/docs/content/errors/NEXUS_LEGACY_DECORATORS.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Token, isNexusError } from '@nexusdi/core';
import { Injectable } from '@nexusdi/decorators';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');

class QuantumComputer {
  constructor(readonly reactor: IReactorCore) {}
}

// Under experimentalDecorators, TypeScript calls a class decorator with the
// class alone. This line makes the same call by hand.
const legacyCall = Injectable({ deps: [REACTOR] }) as unknown as (
  target: unknown,
) => void;

let code = '';
let message = '';
try {
  legacyCall(QuantumComputer);
} catch (error) {
  if (!isNexusError(error, 'NEXUS_LEGACY_DECORATORS')) throw error;
  code = error.code;
  message = error.message;
}
const thrown = code; // -> 'NEXUS_LEGACY_DECORATORS'
console.log(thrown);
const lines = message.split('\n'); // -> ["[NEXUS_LEGACY_DECORATORS] @Injectable was called as a legacy decorator, and NexusDI's decorators are standard (TC39) decorators.", '  Fix: remove experimentalDecorators from tsconfig, or register the class with provide() and defineModule().']
console.log(lines.join('\n'));
```

<!-- #endregion reproduce -->

<!-- #region decorated -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { Injectable } from '@nexusdi/decorators';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

@Injectable({ deps: [REACTOR] })
class QuantumComputer implements IShipComputer {
  constructor(readonly reactor: IReactorCore) {}
}

await using ship = await Nexus.create([
  provide(REACTOR, { useClass: FusionReactor }),
  provide(COMPUTER, { useClass: QuantumComputer }),
]);
const output = ship.get(COMPUTER).reactor.output; // -> 1.21
console.log(output);
```

<!-- #endregion decorated -->

<!-- #region fix -->

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

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
}

await using ship = await Nexus.create([
  provide(REACTOR, { useClass: FusionReactor }),
  provide(COMPUTER, { useClass: QuantumComputer }),
]);
const output = ship.get(COMPUTER).reactor.output; // -> 1.21
console.log(output);
```

<!-- #endregion fix -->
