# @nexusdi/federation

`@nexusdi/federation` lets a shell and the remotes it loads share tokens through a versioned contracts package, even when each bundles its own copy of that package.

```bash
npm install @nexusdi/federation @nexusdi/core
```

The version of `@nexusdi/federation` must equal the version of `@nexusdi/core`.

## Contracts

`defineContract({ key, version })` returns a contract whose `token(name)` and `multi(name)` make tokens keyed `<key>/<name>` and marked with the contract's version. A contracts package defines each contract once, and the shell and every remote import it. `federation()` is the plugin that binds every copy of a contract token to one key, so a remote's copy resolves to the provider the shell registered with its own copy.

<!-- #region contracts -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import type { BlueprintError } from '@nexusdi/core';
import { defineContract, federation } from '@nexusdi/federation';

interface IAuth {
  user(): string;
}
interface IStatements {
  owner(): string;
}
interface ITransfers {
  sender(): string;
}

// The shell's copy and a remote's copy of one contracts package.
const shellBank = defineContract({ key: 'bank', version: '2.3.0' });
const remoteBank = defineContract({ key: 'bank', version: '2.1.0' });

const AUTH = shellBank.token<IAuth>('Auth');
const Shell = defineModule({
  name: 'Shell',
  providers: [provide(AUTH, { useValue: { user: () => 'ada' } })],
  exports: [AUTH],
  global: true,
});
await using ship = await Nexus.create(Shell, { plugins: [federation()] });

// The remote names the token through its own copy.
const STATEMENTS = new Token<IStatements>('Statements');
class Statements implements IStatements {
  static deps = [remoteBank.token<IAuth>('Auth')] as const;
  constructor(private readonly auth: IAuth) {}
  owner() {
    return this.auth.user();
  }
}
await ship.load(
  defineModule({
    name: 'Statements',
    providers: [provide(STATEMENTS, { useClass: Statements })],
    exports: [STATEMENTS],
  }),
);
ship.get(STATEMENTS).owner(); // -> 'ada'

// A remote built against a newer minor than the shell provides.
const newerBank = defineContract({ key: 'bank', version: '2.4.0' });
const TRANSFERS = new Token<ITransfers>('Transfers');
class Transfers implements ITransfers {
  static deps = [newerBank.token<IAuth>('Auth')] as const;
  constructor(private readonly auth: IAuth) {}
  sender() {
    return this.auth.user();
  }
}
const refused = await ship
  .load(
    defineModule({
      name: 'Transfers',
      providers: [provide(TRANSFERS, { useClass: Transfers })],
    }),
  )
  .catch((error: unknown) => error as BlueprintError);
refused?.errors.map((error) => error.code); // -> ['NEXUS_CONTRACT_VERSION']
```

<!-- #endregion contracts -->

A dependent's contract version must have the provider's major, and a minor no newer than the provider's. When the minors match, the dependent's patch must be no newer than the provider's. At major 0 a minor is a breaking change, so a dependent at 0.x needs the provider's minor. This is the rule of npm's `^` range. Any other pair fails the compile with `NEXUS_CONTRACT_VERSION`, which names the contract, the version required and the version provided.

## Sharing

The shell and its remotes share one `@nexusdi/core` as a singleton, so every copy of a contract token meets one container and one `Token` class. The contracts package may be bundled once per remote. `federation()` keys each copy's tokens by the contract key and the name, so two copies of one contract bind to one provider.

`federation()` binds tokens that `defineContract` made. A token made with `new Token()` keeps its identity.
