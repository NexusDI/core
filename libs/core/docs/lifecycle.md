# Lifecycle

## Startup and disposal

`onInit` runs dependencies first, and disposal runs in reverse creation order.

<!-- #region lifecycle -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

const log: string[] = [];
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
  async onInit() {
    log.push('reactor online');
  }
  async [Symbol.asyncDispose]() {
    log.push('reactor scrammed');
  }
}
class ShipComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
  onInit() {
    log.push('computer self-test');
  }
  [Symbol.dispose]() {
    log.push('computer off');
  }
}

const ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(REACTOR, { useClass: FusionReactor }),
      provide(COMPUTER, { useClass: ShipComputer }),
    ],
  }),
);
log; // -> ['reactor online', 'computer self-test']
await ship[Symbol.asyncDispose]();
log; // -> ['reactor online', 'computer self-test', 'computer off', 'reactor scrammed']
```

<!-- #endregion lifecycle -->
