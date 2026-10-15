# Federation examples

## Contracts

A remote's copy of a contract token finds the shell's provider, and a newer minor fails `load()`.

<!-- #region contracts -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import type { BlueprintError } from '@nexusdi/core';
import { defineContract, federation } from '@nexusdi/federation';

interface IReactorCore {
  status(): string;
}
interface INavRoutes {
  plot(to: string): string;
}

// The shell's copy and a section's copy of one contracts package.
const shellContracts = defineContract({ key: 'meridian', version: '2.3.0' });
const sectionContracts = defineContract({ key: 'meridian', version: '2.1.0' });

const REACTOR = shellContracts.token<IReactorCore>('ReactorCore');
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useValue: { status: () => 'online' } })],
  exports: [REACTOR],
  global: true,
});
await using ship = await Nexus.create(Engineering, {
  plugins: [federation()],
});

// The section names the token through its own copy.
const NAV_ROUTES = new Token<INavRoutes>('NavRoutes');
class SectorRoutes implements INavRoutes {
  static deps = [sectionContracts.token<IReactorCore>('ReactorCore')] as const;
  constructor(private readonly reactor: IReactorCore) {}
  plot(to: string) {
    return `course to ${to}, reactor ${this.reactor.status()}`;
  }
}
await ship.load(
  defineModule({
    name: 'Navigation',
    providers: [provide(NAV_ROUTES, { useClass: SectorRoutes })],
    exports: [NAV_ROUTES],
  }),
);
ship.get(NAV_ROUTES).plot('Kepler-442b'); // -> 'course to Kepler-442b, reactor online'

// A section built against a newer minor than the shell provides.
const newerContracts = defineContract({ key: 'meridian', version: '2.4.0' });
const refused = await ship
  .load(
    defineModule({
      name: 'Cartography',
      providers: [
        provide(new Token<INavRoutes>('CartographyRoutes'), {
          useFactory: (reactor: IReactorCore) => ({
            plot: (to: string) => `${to}, reactor ${reactor.status()}`,
          }),
          deps: [newerContracts.token<IReactorCore>('ReactorCore')],
        }),
      ],
    }),
  )
  .catch((error: unknown) => error as BlueprintError);
refused?.errors.map((error) => error.code); // -> ['NEXUS_CONTRACT_VERSION']
```

<!-- #endregion contracts -->

## Error text

`federationText` gives the contract version error its full text.

<!-- #region text -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { defineContract, federation } from '@nexusdi/federation';
import { federationText } from '@nexusdi/federation/text';

interface IAuth {
  user(): string;
}
interface ITransfers {
  sender(): string;
}

const AUTH = defineContract({ key: 'bank', version: '2.3.0' }).token<IAuth>(
  'Auth',
);
const TRANSFERS = new Token<ITransfers>('Transfers');
class Transfers implements ITransfers {
  static deps = [
    defineContract({ key: 'bank', version: '2.4.0' }).token<IAuth>('Auth'),
  ] as const;
  constructor(private readonly auth: IAuth) {}
  sender() {
    return this.auth.user();
  }
}
const graph = defineModule({
  name: 'Root',
  imports: [
    defineModule({
      name: 'Shell',
      providers: [provide(AUTH, { useValue: { user: () => 'ada' } })],
      exports: [AUTH],
      global: true,
    }),
    defineModule({
      name: 'Transfers',
      providers: [provide(TRANSFERS, { useClass: Transfers })],
    }),
  ],
});

const messageWith = (options: Parameters<typeof Nexus.check>[1]) => {
  try {
    Nexus.check(graph, options);
  } catch (error) {
    return (error as { errors: Error[] }).errors[0]?.message.split('\n');
  }
  return undefined;
};

messageWith({ plugins: [federation()] }); // -> ['[NEXUS_CONTRACT_VERSION] contract=bank/Auth required=2.4.0 provided=2.3.0. https://nexus.js.org/errors/NEXUS_CONTRACT_VERSION']
messageWith({ plugins: [federation(), errors({ text: [federationText] })] }); // -> ['[NEXUS_CONTRACT_VERSION] bank/Auth is needed at 2.4.0, and the provider has 2.3.0.', '  Fix: build the provider against 2.4.0 or a newer 2.x, or build the dependent against 2.3.0.']
```

<!-- #endregion text -->
