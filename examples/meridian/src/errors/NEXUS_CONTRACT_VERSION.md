# NEXUS_CONTRACT_VERSION examples

Regions for `apps/docs/content/errors/NEXUS_CONTRACT_VERSION.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';
import { defineContract, federation } from '@nexusdi/federation';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}

// The shell's copy of the contracts package, and a remote's newer copy.
const shellContract = defineContract({ key: 'meridian', version: '2.3.0' });
const remoteContract = defineContract({ key: 'meridian', version: '2.4.0' });

const REACTOR = shellContract.token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class QuantumComputer implements IShipComputer {
  static deps = [remoteContract.token<IReactorCore>('ReactorCore')] as const;
  constructor(readonly reactor: IReactorCore) {}
}

const Meridian = defineModule({
  name: 'Meridian',
  imports: [
    defineModule({
      name: 'Engineering',
      providers: [provide(REACTOR, { useValue: { output: 1.21 } })],
      exports: [REACTOR],
      global: true,
    }),
    defineModule({
      name: 'Computers',
      providers: [provide(COMPUTER, { useClass: QuantumComputer })],
    }),
  ],
});

const error = await Nexus.create(Meridian, { plugins: [federation()] }).catch(
  (caught: unknown) => caught,
);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const message = inner?.message; // -> '[NEXUS_CONTRACT_VERSION] contract=meridian/ReactorCore required=2.4.0 provided=2.3.0. https://nexus.js.org/errors/NEXUS_CONTRACT_VERSION'
console.log(message);
```

<!-- #endregion reproduce -->

<!-- #region full-text -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { defineContract, federation } from '@nexusdi/federation';
import { federationText } from '@nexusdi/federation/text';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}

const shellContract = defineContract({ key: 'meridian', version: '2.3.0' });
const remoteContract = defineContract({ key: 'meridian', version: '2.4.0' });

const REACTOR = shellContract.token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class QuantumComputer implements IShipComputer {
  static deps = [remoteContract.token<IReactorCore>('ReactorCore')] as const;
  constructor(readonly reactor: IReactorCore) {}
}

const Meridian = defineModule({
  name: 'Meridian',
  imports: [
    defineModule({
      name: 'Engineering',
      providers: [provide(REACTOR, { useValue: { output: 1.21 } })],
      exports: [REACTOR],
      global: true,
    }),
    defineModule({
      name: 'Computers',
      providers: [provide(COMPUTER, { useClass: QuantumComputer })],
    }),
  ],
});

const error = await Nexus.create(Meridian, {
  plugins: [federation(), errors({ text: [federationText] })],
}).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const lines = inner?.message.split('\n'); // -> ['[NEXUS_CONTRACT_VERSION] meridian/ReactorCore is needed at 2.4.0, and the provider has 2.3.0.', '  Fix: build the provider against 2.4.0 or a newer 2.x, or build the dependent against 2.3.0.']
console.log(lines?.join('\n'));
```

<!-- #endregion full-text -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { defineContract, federation } from '@nexusdi/federation';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}

// The shell now provides the contract at 2.4.0, the version the remote needs.
const shellContract = defineContract({ key: 'meridian', version: '2.4.0' });
const remoteContract = defineContract({ key: 'meridian', version: '2.4.0' });

const REACTOR = shellContract.token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class QuantumComputer implements IShipComputer {
  static deps = [remoteContract.token<IReactorCore>('ReactorCore')] as const;
  constructor(readonly reactor: IReactorCore) {}
}

const Meridian = defineModule({
  name: 'Meridian',
  imports: [
    defineModule({
      name: 'Engineering',
      providers: [provide(REACTOR, { useValue: { output: 1.21 } })],
      exports: [REACTOR],
      global: true,
    }),
    defineModule({
      name: 'Computers',
      providers: [provide(COMPUTER, { useClass: QuantumComputer })],
      exports: [COMPUTER],
    }),
  ],
  exports: [COMPUTER],
});

await using ship = await Nexus.create(Meridian, { plugins: [federation()] });
const output = ship.get(COMPUTER).reactor.output; // -> 1.21
console.log(output);
```

<!-- #endregion fix -->
