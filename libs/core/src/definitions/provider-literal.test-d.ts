import { describe, expectTypeOf, it } from 'vitest';

import {
  defineModule,
  type ModuleDefinition,
  type ProviderEntry,
} from './define-module.js';
import { all, lazy, optional } from './modifiers.js';
import { provide, type Provider } from './provide.js';
import { MultiToken, Token } from './token.js';

class ReactorCore {
  output = 1.21;
}
class ShipComputer {
  constructor(readonly reactor: ReactorCore) {}
}
class Beacon {}
class PowerRouter {
  constructor(readonly shields: () => ShieldGrid) {}
}
class ShieldGrid {
  constructor(readonly router: PowerRouter) {}
}
interface NavCharts {
  plot(to: string): string;
}
class SubspaceLink {
  download(path: string): Promise<NavCharts> {
    return Promise.resolve({ plot: () => path });
  }
}
interface Diagnostic {
  run(): boolean;
}
const NAV_CHARTS = new Token<NavCharts>('NavCharts');
const COMPUTER = new Token<ShipComputer>('Computer');
const REPORT = new Token<string>('Report');
const HANDLER = new Token<(n: number) => string>('Handler');
const DIAGNOSTICS = new MultiToken<Diagnostic>('Diagnostics');
const charts: NavCharts = { plot: (to) => to };
const hull: Diagnostic = { run: () => true };

describe('defineModule', () => {
  it('accepts every literal form beside bare classes and provide() results', () => {
    expectTypeOf(
      defineModule({
        name: 'Engineering',
        providers: [
          ReactorCore,
          provide(ShieldGrid, { deps: [PowerRouter] }),
          { token: ShipComputer, deps: [ReactorCore], lifetime: 'transient' },
          { token: PowerRouter, deps: [lazy(ShieldGrid)] },
          { token: Beacon },
          { token: Beacon, lifetime: 'scoped' },
          { token: NAV_CHARTS, useValue: charts },
          { token: COMPUTER, useClass: ShipComputer, deps: [ReactorCore] },
          { token: COMPUTER, useExisting: ShipComputer },
          {
            token: NAV_CHARTS,
            useFactory: async (link: SubspaceLink) => link.download('charts'),
            deps: [SubspaceLink],
            lifetime: 'scoped',
          },
          {
            token: REPORT,
            useFactory: (
              checks: Diagnostic[],
              link: SubspaceLink | undefined,
            ) => `${checks.length} ${link === undefined}`,
            deps: [all(DIAGNOSTICS), optional(SubspaceLink)],
          },
          { token: REPORT, useFactory: () => 'none', deps: [] },
          { token: REPORT, useFactory: () => 'none' },
          { token: HANDLER, useValue: (n: number) => n.toFixed(2) },
          { token: DIAGNOSTICS, useValue: hull },
          { token: DIAGNOSTICS, useFactory: () => hull, deps: [] },
        ],
      }),
    ).toEqualTypeOf<ModuleDefinition>();
  });

  it('accepts a widened entry array unchanged', () => {
    const entries: ProviderEntry[] = [
      ReactorCore,
      { token: NAV_CHARTS, useValue: charts },
    ];
    const provided: Provider<unknown>[] = [provide(ReactorCore)];
    defineModule({ name: 'Wide', providers: entries });
    defineModule({ name: 'Provided', providers: provided });
  });

  it('puts a wrong dep error on the dep', () => {
    defineModule({
      name: 'WrongDep',
      providers: [
        ReactorCore,
        {
          token: ShipComputer,
          // @ts-expect-error SubspaceLink is not a ReactorCore
          deps: [SubspaceLink],
        },
      ],
    });
  });

  it('puts a missing deps error on the element', () => {
    defineModule({
      name: 'MissingDep',
      providers: [
        ReactorCore,
        // @ts-expect-error ShipComputer takes a ReactorCore
        { token: ShipComputer },
      ],
    });
  });

  it('puts a bad value error on the value', () => {
    defineModule({
      name: 'BadValue',
      providers: [
        {
          token: NAV_CHARTS,
          // @ts-expect-error { nope: 1 } is not a NavCharts
          useValue: { nope: 1 },
        },
      ],
    });
  });

  it('puts an async transient error on the lifetime', () => {
    defineModule({
      name: 'AsyncTransient',
      providers: [
        {
          token: NAV_CHARTS,
          useFactory: async () => charts,
          deps: [],
          // @ts-expect-error get() cannot await a transient factory
          lifetime: 'transient',
        },
      ],
    });
  });

  it('keeps the NoInfer hole closed on useValue and useExisting', () => {
    defineModule({
      name: 'NoInfer',
      providers: [
        // @ts-expect-error a number is not a string, and the token is not widened
        { token: REPORT, useValue: 42 },
        // @ts-expect-error ReactorCore is not a ShipComputer
        { token: COMPUTER, useExisting: ReactorCore },
      ],
    });
  });

  it('rejects a lifetime on useValue and useExisting', () => {
    defineModule({
      name: 'ValueLifetime',
      providers: [
        // @ts-expect-error a value has no lifetime
        { token: NAV_CHARTS, useValue: charts, lifetime: 'scoped' },
        // @ts-expect-error an alias has no lifetime
        { token: COMPUTER, useExisting: ShipComputer, lifetime: 'scoped' },
      ],
    });
  });

  it('rejects a factory parameter that no deps entry supplies', () => {
    defineModule({
      name: 'NoDeps',
      providers: [
        // @ts-expect-error deps defaults to [], so the factory gets no argument
        { token: REPORT, useFactory: (n: number) => n.toFixed() },
      ],
    });
  });

  it('rejects a Promise-typed token on a factory', () => {
    const PROMISED = new Token<Promise<NavCharts>>('Promised');
    defineModule({
      name: 'Promised',
      providers: [
        // @ts-expect-error the container awaits a factory result
        { token: PROMISED, useFactory: async () => charts, deps: [] },
      ],
    });
  });

  it('rejects a key that no provider form has', () => {
    defineModule({
      name: 'Typo',
      providers: [
        // @ts-expect-error lifeTime is not a provider key
        { token: Beacon, lifeTime: 'scoped' },
      ],
    });
  });

  it('asks for annotations on a function whose parameters need a contextual type', () => {
    defineModule({
      name: 'Untyped',
      providers: [
        {
          token: NAV_CHARTS,
          // @ts-expect-error a literal cannot type link from deps; provide() can
          useFactory: (link) => link.download('charts'),
          deps: [SubspaceLink],
        },
      ],
    });
  });

  it('infers Opts from the options token and checks the schema against it', () => {
    const OPTIONS = new Token<{ frequency: number }>('CommsOptions');
    const Comms = defineModule({
      name: 'Comms',
      options: OPTIONS,
      providers: [{ token: REPORT, useValue: 'x' }],
    });
    expectTypeOf(Comms.options).toEqualTypeOf<Token<{ frequency: number }>>();
  });
});
