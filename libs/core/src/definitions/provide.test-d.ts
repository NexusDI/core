import { describe, expectTypeOf, it } from 'vitest';

import { all, lazy, optional } from './modifiers.js';
import { provide, type Provider } from './provide.js';
import { MultiToken, Token } from './token.js';

class ReactorCore {
  output = 1.21;
}
class ShipComputer {
  constructor(readonly reactor: ReactorCore) {}
}
interface NavCharts {
  plot(to: string): string;
}
class SubspaceLink {
  download(path: string): NavCharts {
    return { plot: () => path };
  }
}
class Beacon {}
class ShieldGrid {
  draw() {
    return 0.4;
  }
}
class PowerRouter {
  constructor(readonly shields: () => ShieldGrid) {}
}
interface Diagnostic {
  run(): boolean;
}
class ReactorDiagnostic implements Diagnostic {
  constructor(readonly reactor: ReactorCore) {}
  run() {
    return true;
  }
}
class DiagnosticsPanel {
  constructor(
    readonly checks: Diagnostic[],
    readonly link?: SubspaceLink,
  ) {}
}

const NAV_CHARTS = new Token<NavCharts>('NavCharts');
const COMPUTER = new Token<ShipComputer>('Computer');
const DIAGNOSTICS = new MultiToken<Diagnostic>('Diagnostics');
const charts: NavCharts = { plot: (to) => to };
const asyncCharts = async (): Promise<NavCharts> => charts;

describe('provide', () => {
  it('returns a Provider of the instance type for a class', () => {
    expectTypeOf(provide(ShipComputer, { deps: [ReactorCore] })).toEqualTypeOf<
      Provider<ShipComputer>
    >();
    expectTypeOf(provide(Beacon)).toEqualTypeOf<Provider<Beacon>>();
  });

  it('checks deps against the constructor', () => {
    // @ts-expect-error SubspaceLink is not a ReactorCore
    provide(ShipComputer, { deps: [SubspaceLink] });
    // @ts-expect-error a class with parameters needs deps
    provide(ShipComputer);
    // @ts-expect-error one deps entry too many
    provide(ShipComputer, { deps: [ReactorCore, ReactorCore] });
  });

  it('accepts lazy, optional and all where the parameter allows them', () => {
    provide(PowerRouter, { deps: [lazy(ShieldGrid)] });
    provide(DiagnosticsPanel, {
      deps: [all(DIAGNOSTICS), optional(SubspaceLink)],
    });
    provide(Beacon, { lifetime: 'transient' });
  });

  it('keeps useValue from widening the token type', () => {
    expectTypeOf(provide(NAV_CHARTS, { useValue: charts })).toEqualTypeOf<
      Provider<NavCharts>
    >();
    // @ts-expect-error 'nope' does not exist in type 'NavCharts'
    provide(NAV_CHARTS, { useValue: { nope: 1 } });
  });

  it('accepts undefined as a value where the token type allows it', () => {
    const MAYBE = new Token<string | undefined>('Maybe');
    expectTypeOf(provide(MAYBE, { useValue: undefined })).toEqualTypeOf<
      Provider<string | undefined>
    >();
  });

  it('checks useExisting against the token type', () => {
    provide(COMPUTER, { useExisting: ShipComputer });
    // @ts-expect-error ReactorCore lacks 'reactor'
    provide(COMPUTER, { useExisting: ReactorCore });
  });

  it('checks useClass against the token type and its deps', () => {
    provide(DIAGNOSTICS, { useClass: ReactorDiagnostic, deps: [ReactorCore] });
    // @ts-expect-error ReactorCore is not NavCharts
    provide(NAV_CHARTS, { useClass: ReactorCore });
  });

  it('types factory arguments from deps', () => {
    provide(NAV_CHARTS, {
      useFactory: (link, maybe, core, checks) => {
        expectTypeOf(link).toEqualTypeOf<SubspaceLink>();
        expectTypeOf(maybe).toEqualTypeOf<SubspaceLink | undefined>();
        expectTypeOf(core).toEqualTypeOf<() => ReactorCore>();
        expectTypeOf(checks).toEqualTypeOf<Diagnostic[]>();
        return link.download('charts/sector-7');
      },
      deps: [
        SubspaceLink,
        optional(SubspaceLink),
        lazy(ReactorCore),
        all(DIAGNOSTICS),
      ],
    });
  });

  it('accepts an async factory for a singleton or a scoped token', () => {
    provide(NAV_CHARTS, { useFactory: asyncCharts, deps: [] });
    provide(NAV_CHARTS, {
      useFactory: asyncCharts,
      deps: [],
      lifetime: 'scoped',
    });
  });

  it('rejects an async transient factory with NEXUS_ASYNC_TRANSIENT', () => {
    const transient = {
      useFactory: asyncCharts,
      deps: [],
      lifetime: 'transient',
    } as const;
    // @ts-expect-error NEXUS_ASYNC_TRANSIENT
    provide(NAV_CHARTS, transient);
  });

  it('rejects a factory for a token that holds a Promise with NEXUS_PROMISE_TOKEN', () => {
    const PROMISED = new Token<Promise<NavCharts>>('Promised');
    const definition = { useFactory: asyncCharts, deps: [] } as const;
    // @ts-expect-error NEXUS_PROMISE_TOKEN
    provide(PROMISED, definition);
  });

  it('rejects a bare MultiToken in deps', () => {
    // @ts-expect-error wrap DIAGNOSTICS in all()
    provide(NAV_CHARTS, { useFactory: () => charts, deps: [DIAGNOSTICS] });
  });

  it('rejects a lifetime on useValue and useExisting', () => {
    // @ts-expect-error a value has no lifetime
    provide(NAV_CHARTS, { useValue: charts, lifetime: 'scoped' });
    // @ts-expect-error an alias has no lifetime
    provide(COMPUTER, { useExisting: ShipComputer, lifetime: 'scoped' });
  });

  it('contributes one element per call to a MultiToken', () => {
    const passing: Diagnostic = { run: () => true };
    expectTypeOf(provide(DIAGNOSTICS, { useValue: passing })).toEqualTypeOf<
      Provider<Diagnostic>
    >();
    // @ts-expect-error a MultiToken provider contributes one element, not the array
    provide(DIAGNOSTICS, { useValue: [passing] });
  });
});

describe('Provider', () => {
  it('is covariant in its type', () => {
    expectTypeOf<Provider<ShipComputer>>().toExtend<Provider<unknown>>();
    expectTypeOf<Provider<string>>().not.toExtend<Provider<number>>();
  });
});
