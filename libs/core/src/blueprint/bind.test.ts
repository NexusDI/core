import { describe, expect, it } from 'vitest';

import { compileErrors, idOf } from '../../test-support/compile.js';
import { defineModule } from '../definitions/define-module.js';
import { all, lazy, optional } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { MultiToken, Token } from '../definitions/token.js';
import { compile } from './compile.js';

class ReactorCore {}
class ShipComputer {
  constructor(readonly reactor: ReactorCore) {}
}
interface NavCharts {
  plot(): string;
}
const NAV_CHARTS = new Token<NavCharts>('NavCharts');
const charts: NavCharts = { plot: () => 'x' };
const DIAGNOSTICS = new MultiToken<string>('Diagnostics');

describe('compile', () => {
  it('records a required edge and binding for each dep', () => {
    const bp = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          ReactorCore,
          provide(ShipComputer, { deps: [ReactorCore] }),
        ],
      }),
    });
    const computer = idOf(bp, ShipComputer);
    const reactor = idOf(bp, ReactorCore);
    expect(bp.edges).toEqual([
      { from: computer, to: reactor, kind: 'required' },
    ]);
    expect(bp.bindings.get(computer)).toEqual({
      args: [{ kind: 'required', token: ReactorCore, ids: [reactor] }],
      props: [],
      target: null,
    });
  });

  it('binds an optional dep with no provider to nothing and records no edge', () => {
    const bp = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          provide(NAV_CHARTS, {
            useFactory: () => charts,
            deps: [optional(ReactorCore)],
          }),
        ],
      }),
    });
    expect(bp.edges).toEqual([]);
    expect(bp.bindings.get(idOf(bp, NAV_CHARTS))?.args).toEqual([
      { kind: 'optional', token: ReactorCore, ids: [] },
    ]);
  });

  it('binds all() to every visible contribution, and to none when nothing contributes', () => {
    const bp = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          provide(DIAGNOSTICS, { useValue: 'a' }),
          provide(DIAGNOSTICS, { useValue: 'b' }),
          provide(NAV_CHARTS, {
            useFactory: () => charts,
            deps: [all(DIAGNOSTICS)],
          }),
        ],
      }),
    });
    const args = bp.bindings.get(idOf(bp, NAV_CHARTS))?.args;
    expect(args?.[0]?.ids).toHaveLength(2);
    expect(bp.edges.filter((e) => e.kind === 'all')).toHaveLength(2);

    const empty = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          provide(NAV_CHARTS, {
            useFactory: () => charts,
            deps: [all(DIAGNOSTICS)],
          }),
        ],
      }),
    });
    expect(empty.bindings.get(idOf(empty, NAV_CHARTS))?.args).toEqual([
      { kind: 'all', token: DIAGNOSTICS, ids: [] },
    ]);
  });

  it('records alias and lazy edges', () => {
    const COMPUTER = new Token<ShipComputer>('Computer');
    const bp = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          ReactorCore,
          provide(ShipComputer, { deps: [lazy(ReactorCore)] as never }),
          provide(COMPUTER, { useExisting: ShipComputer }),
        ],
      }),
    });
    expect(bp.edges.map((e) => e.kind)).toEqual(['lazy', 'alias']);
    expect(bp.bindings.get(idOf(bp, COMPUTER))?.target).toBe(
      idOf(bp, ShipComputer),
    );
  });

  it('reports NEXUS_MISSING_PROVIDER with the requester, its module and a not-exported near miss', () => {
    const Tactical = defineModule({
      name: 'Tactical',
      providers: [provide(NAV_CHARTS, { useValue: charts })],
    });
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [provide(ShipComputer, { deps: [NAV_CHARTS] as never })],
    });
    const [error] = compileErrors(
      defineModule({ name: 'Meridian', imports: [Engineering, Tactical] }),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_MISSING_PROVIDER',
      token: 'NavCharts',
      requester: 'ShipComputer',
      module: 'Engineering',
      nearMisses: [{ kind: 'not-exported', module: 'Tactical' }],
    });
    expect(error?.message).toBe(
      '[NEXUS_MISSING_PROVIDER] ShipComputer (module Engineering) depends on NavCharts, but no provider of NavCharts is visible in Engineering.\n' +
        '  NavCharts is provided in Tactical, which does not export it.\n' +
        "  Fix: add NavCharts to Tactical's exports and import Tactical into Engineering.",
    );
  });

  it('reports a not-imported near miss for an exported token the requester cannot reach', () => {
    const Tactical = defineModule({
      name: 'Tactical',
      providers: [provide(NAV_CHARTS, { useValue: charts })],
      exports: [NAV_CHARTS],
    });
    const Comms = defineModule({
      name: 'Comms',
      providers: [provide(ShipComputer, { deps: [NAV_CHARTS] as never })],
    });
    expect(
      compileErrors(defineModule({ name: 'Root', imports: [Comms, Tactical] })),
    ).toMatchObject([
      {
        code: 'NEXUS_MISSING_PROVIDER',
        nearMisses: [{ kind: 'not-imported', module: 'Tactical' }],
      },
    ]);
  });

  it('reports a same-description near miss for a second Token object with one description', () => {
    const OTHER = new Token<NavCharts>('NavCharts');
    const Tactical = defineModule({
      name: 'Tactical',
      providers: [provide(OTHER, { useValue: charts })],
      exports: [OTHER],
    });
    const Engineering = defineModule({
      name: 'Engineering',
      imports: [Tactical],
      providers: [provide(ShipComputer, { deps: [NAV_CHARTS] as never })],
    });
    expect(compileErrors(Engineering)).toMatchObject([
      {
        code: 'NEXUS_MISSING_PROVIDER',
        nearMisses: [{ kind: 'same-description', module: 'Tactical' }],
      },
    ]);
  });

  it('reports no same-description near miss for two classes that share a name', () => {
    const Probe = (() => class Probe {})();
    const OtherProbe = (() => class Probe {})();
    const Science = defineModule({
      name: 'Science',
      providers: [OtherProbe],
      exports: [OtherProbe],
    });
    const Root = defineModule({
      name: 'Root',
      imports: [Science],
      providers: [
        provide(NAV_CHARTS, { useFactory: () => charts, deps: [Probe] }),
      ],
    });
    expect(compileErrors(Root)).toMatchObject([
      { code: 'NEXUS_MISSING_PROVIDER', token: 'Probe', nearMisses: [] },
    ]);
  });

  it('reports one error for a malformed provider, not a missing provider for its dependents too', () => {
    const Root = defineModule({
      name: 'Root',
      providers: [
        provide(NAV_CHARTS, { useFactory: 'nope', deps: [] } as never),
        provide(ShipComputer, { deps: [NAV_CHARTS] as never }),
      ],
    });
    expect(compileErrors(Root).map((e) => e.code)).toEqual([
      'NEXUS_INVALID_PROVIDER',
    ]);
  });

  it('reports one error for an ambiguous token, not a missing provider for its dependents too', () => {
    const A = defineModule({
      name: 'A',
      providers: [provide(NAV_CHARTS, { useValue: charts })],
      exports: [NAV_CHARTS],
    });
    const B = defineModule({
      name: 'B',
      providers: [provide(NAV_CHARTS, { useValue: charts })],
      exports: [NAV_CHARTS],
    });
    const Root = defineModule({
      name: 'Root',
      imports: [A, B],
      providers: [provide(ShipComputer, { deps: [NAV_CHARTS] as never })],
    });
    expect(compileErrors(Root).map((e) => e.code)).toEqual([
      'NEXUS_AMBIGUOUS_PROVIDER',
    ]);
  });
});
