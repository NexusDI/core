import {
  Nexus,
  MultiToken,
  Token,
  all,
  defineModule,
  optional,
  provide,
  REQUEST,
} from '@nexusdi/core';

import { rejected, thrown } from './catch.js';
import { inject, injectable } from './metadata.js';

/** An operation that ends in the error whose message a test asserts. */
export interface MessageScenario {
  readonly name: string;
  readonly run: (plugins: readonly unknown[]) => Promise<unknown>;
}

const options = (plugins: readonly unknown[]) =>
  (plugins.length === 0 ? undefined : { plugins }) as never;

/** provide() without its types, for entries only JavaScript callers can write. */
const rawProvide = provide as (token: unknown, options?: unknown) => unknown;

class ReactorCore {
  output = 1.21;
}
class SubspaceLink {
  frequency = 1420;
}
class ShipComputer {
  constructor(readonly charts: unknown) {}
}
interface NavCharts {
  plot(): string;
}
const NAV_CHARTS = new Token<NavCharts>('NavCharts');
const DIAGNOSTICS = new MultiToken<unknown>('Diagnostics');

/** Rejects Nexus.create() of an Engineering module with one bad provider. */
function rejectEngineering(
  entry: unknown,
): (plugins: readonly unknown[]) => Promise<unknown> {
  return (plugins) =>
    rejected(
      Nexus.create(
        defineModule({ name: 'Engineering', providers: [entry as never] }),
        options(plugins),
      ),
    );
}

/** Throws from resolve() on a fresh Tactical ship. */
function throwFromResolve(
  build: (ship: Nexus) => unknown,
): (plugins: readonly unknown[]) => Promise<unknown> {
  return async (plugins) => {
    const ship = await Nexus.create(
      defineModule({ name: 'Tactical' }),
      options(plugins),
    );
    return thrown(() => build(ship));
  };
}

export const messageScenarios: readonly MessageScenario[] = [
  {
    name: 'a factory that throws a string',
    run: async (plugins) => {
      const NAME = new Token<string>('Name');
      const Root = defineModule({
        name: 'Root',
        providers: [
          provide(NAME, {
            useFactory: () => {
              throw 'offline';
            },
            deps: [],
          }),
        ],
      });
      return rejected(Nexus.create(Root, options(plugins)));
    },
  },
  {
    name: 'resolve() with a missing deps[1]',
    run: async (plugins) => {
      const Engineering = defineModule({
        name: 'Engineering',
        providers: [ReactorCore],
      });
      const ship = await Nexus.create(
        defineModule({ name: 'Meridian', imports: [Engineering] }),
        options(plugins),
      );
      return thrown(() => ship.resolve([optional(SubspaceLink), ReactorCore]));
    },
  },
  {
    name: 'resolve() with a string entry',
    run: throwFromResolve((ship) => ship.resolve({ name: 'nav' } as never)),
  },
  {
    name: 'resolve() with a bare MultiToken entry',
    run: throwFromResolve((ship) =>
      ship.resolve({ checks: DIAGNOSTICS } as never),
    ),
  },
  {
    name: 'resolve() with a bad modifier entry',
    run: throwFromResolve((ship) =>
      ship.resolve({ checks: all(NAV_CHARTS as never) }),
    ),
  },
  {
    name: 'resolve() with a value that is not a deps map or a deps tuple',
    run: throwFromResolve((ship) => ship.resolve(5 as never)),
  },
  {
    name: 'a dependency provided in a module that does not export it',
    run: async (plugins) => {
      const Tactical = defineModule({
        name: 'Tactical',
        providers: [provide(NAV_CHARTS, { useValue: { plot: () => 'x' } })],
      });
      const Engineering = defineModule({
        name: 'Engineering',
        providers: [provide(ShipComputer, { deps: [NAV_CHARTS] as never })],
      });
      return rejected(
        Nexus.create(
          defineModule({ name: 'Meridian', imports: [Engineering, Tactical] }),
          options(plugins),
        ),
      );
    },
  },
  {
    name: 'a providers list with null and a number',
    run: async (plugins) =>
      rejected(
        Nexus.create(
          defineModule({
            name: 'Root',
            providers: [null as never, 42 as never],
          }),
          options(plugins),
        ),
      ),
  },
  {
    name: 'a three-provider cycle',
    run: async (plugins) => {
      class Helm {
        constructor(readonly nav: unknown) {}
      }
      class Navigation {
        constructor(readonly sensors: unknown) {}
      }
      class Sensors {
        constructor(readonly helm: unknown) {}
      }
      return rejected(
        Nexus.create(
          defineModule({
            name: 'Bridge',
            providers: [
              provide(Helm, { deps: [Navigation] }),
              provide(Navigation, { deps: [Sensors] }),
              provide(Sensors, { deps: [Helm] }),
            ],
          }),
          options(plugins),
        ),
      );
    },
  },
  {
    name: 'a useClass binding to a class without deps',
    run: (plugins) => {
      class Bare {
        constructor(readonly name: string) {}
      }
      return rejectEngineering(rawProvide(NAV_CHARTS, { useClass: Bare }))(
        plugins,
      );
    },
  },
  {
    name: 'defineModule() with a config that has no name',
    run: async () => thrown(() => defineModule({} as never)),
  },
  {
    name: 'new Token() with an empty description',
    run: async () => thrown(() => new Token('')),
  },
  {
    name: 'a bare class whose static deps getter throws',
    run: (plugins) => {
      class Trap {
        static get deps(): never {
          throw new Error('offline');
        }
        constructor(readonly name: string) {}
      }
      return rejectEngineering(Trap)(plugins);
    },
  },
  {
    name: 'a bare class whose static deps is not an array',
    run: (plugins) => {
      class NotArray {
        static deps = 'nav';
        constructor(readonly name: string) {}
      }
      return rejectEngineering(NotArray)(plugins);
    },
  },
  {
    name: 'a bare class that declares deps in both @Injectable and static deps',
    run: (plugins) => {
      class Twice {
        static deps: readonly unknown[] = [NAV_CHARTS];
        constructor(readonly charts: unknown) {}
      }
      injectable(Twice, { deps: [NAV_CHARTS] });
      return rejectEngineering(Twice)(plugins);
    },
  },
  {
    name: 'a bare class whose @Injectable metadata getter throws',
    run: (plugins) => {
      class MetaTrap {}
      Object.defineProperty(MetaTrap, Symbol.metadata, {
        get(): never {
          throw new Error('offline');
        },
        configurable: true,
      });
      return rejectEngineering(MetaTrap)(plugins);
    },
  },
  {
    name: 'a bare class with an invalid @Injectable lifetime',
    run: (plugins) => {
      class BadLifetime {}
      injectable(BadLifetime, { lifetime: 'forever' });
      return rejectEngineering(BadLifetime)(plugins);
    },
  },
  {
    name: 'a bare class with a bad @Inject dependency',
    run: (plugins) => {
      class Bridge {}
      inject(Bridge, 'charts', 'nav');
      return rejectEngineering(Bridge)(plugins);
    },
  },
  {
    name: 'a provide() result whose options are not an object',
    run: (plugins) => {
      const NAME = new Token<string>('Name');
      return rejectEngineering(rawProvide(NAME, 5))(plugins);
    },
  },
  {
    name: 'a providers deps entry with a bad modifier',
    run: rejectEngineering(
      provide(NAV_CHARTS, {
        useFactory: () => ({ plot: () => 'x' }),
        deps: [optional(DIAGNOSTICS as never)],
      }),
    ),
  },
  {
    name: 'a providers deps entry that is a bare MultiToken',
    run: rejectEngineering(
      provide(NAV_CHARTS, {
        useFactory: () => ({ plot: () => 'x' }),
        deps: [DIAGNOSTICS] as never,
      }),
    ),
  },
  {
    name: 'a providers deps entry that is not a token',
    run: rejectEngineering(
      provide(NAV_CHARTS, {
        useFactory: () => ({ plot: () => 'x' }),
        deps: ['nav'] as never,
      }),
    ),
  },
  {
    name: 'a providers entry with deps that are not an array',
    run: rejectEngineering(
      rawProvide(NAV_CHARTS, { useFactory: () => 1, deps: 'nav' }),
    ),
  },
  {
    name: 'a providers entry that is a module',
    run: (plugins) => {
      const Comms = defineModule({ name: 'Comms' });
      return rejectEngineering(Comms)(plugins);
    },
  },
  {
    name: 'a provider literal whose options throw when read',
    run: rejectEngineering({
      token: NAV_CHARTS,
      get useValue(): never {
        throw new Error('offline');
      },
    }),
  },
  {
    name: 'a provider for REQUEST',
    run: rejectEngineering(provide(REQUEST, { useValue: {} })),
  },
  {
    name: 'a token provider with no definition',
    run: rejectEngineering(rawProvide(NAV_CHARTS, {})),
  },
  {
    name: 'a provider that sets two definitions',
    run: rejectEngineering(
      rawProvide(NAV_CHARTS, { useValue: 1, useFactory: () => 1 }),
    ),
  },
  {
    name: 'a class binding with an invalid lifetime',
    run: rejectEngineering(rawProvide(ReactorCore, { lifetime: 'forever' })),
  },
  {
    name: 'a useClass that is not a class',
    run: rejectEngineering(rawProvide(NAV_CHARTS, { useClass: 5 })),
  },
  {
    name: 'a lifetime set on useValue',
    run: rejectEngineering(
      rawProvide(NAV_CHARTS, { useValue: 1, lifetime: 'singleton' }),
    ),
  },
  {
    name: 'a useFactory that is not a function',
    run: rejectEngineering(rawProvide(NAV_CHARTS, { useFactory: 5 })),
  },
  {
    name: 'a lifetime set on useExisting',
    run: (plugins) => {
      const OTHER = new Token<unknown>('Other');
      return rejectEngineering(
        rawProvide(NAV_CHARTS, { useExisting: OTHER, lifetime: 'singleton' }),
      )(plugins);
    },
  },
  {
    name: 'a useExisting that aliases a MultiToken',
    run: rejectEngineering(
      provide(NAV_CHARTS, { useExisting: DIAGNOSTICS as never }),
    ),
  },
  {
    name: 'a with() factory with a bad dep',
    run: async (plugins) => {
      const OPTIONS = new Token<{ freq: number }>('CommsOptions');
      const Comms = defineModule({ name: 'Comms', options: OPTIONS });
      return rejected(
        Nexus.create(
          Comms.with({
            deps: ['freq'],
            useFactory: (freq: unknown) => ({ freq }),
          } as never),
          options(plugins),
        ),
      );
    },
  },
];
