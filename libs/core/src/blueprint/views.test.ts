import { describe, expect, it } from 'vitest';

import { defineModule } from '../definitions/define-module.js';
import type { AnyToken } from '../definitions/guards.js';
import { all, lazy } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { MultiToken, Token } from '../definitions/token.js';
import { compile } from './compile.js';
import { buildView, sameToken, viewOfBlueprint } from './views.js';

interface INavComputer {
  readonly course: string;
}
const NAV = new Token<INavComputer>('NavComputer');
const Helm = defineModule({
  name: 'Helm',
  providers: [provide(NAV, { useValue: { course: 'Kepler-452b' } })],
  exports: [NAV],
});

describe('viewOfBlueprint', () => {
  it('returns one frozen object per blueprint', () => {
    const bp = compile({ root: Helm });
    const view = viewOfBlueprint(bp, sameToken);
    expect(Object.isFrozen(view)).toBe(true);
    expect(viewOfBlueprint(bp, sameToken)).toBe(view);
    expect(viewOfBlueprint(compile({ root: Helm }), sameToken)).not.toBe(view);
  });

  it("carries the root module's id, and visible() finds the root's providers", () => {
    const bp = compile({ root: Helm });
    const view = viewOfBlueprint(bp, sameToken);
    expect(view).toMatchObject({ phase: 'create', complete: true, root: 'm0' });
    expect(view.modules.find((m) => m.id === view.root)?.name).toBe('Helm');
    expect(view.visible(view.root, NAV)).toHaveLength(1);
  });
});

describe('grants on the view', () => {
  it('lists the module ids a load grant gave a module, and none for the others', () => {
    const Wrapper = defineModule({ name: 'Wrapper', imports: [Helm] });
    const Host = defineModule({ name: 'Host', imports: [Wrapper] });
    const Science = defineModule({ name: 'Science' });
    const first = compile({ root: Host });
    const bp = compile({
      root: Host,
      extraImports: [{ module: Science, imports: [Helm] }],
      previous: first,
    });
    const view = viewOfBlueprint(bp, sameToken);
    const byName = new Map(view.modules.map((m) => [m.name, m]));
    const helm = byName.get('Helm')?.id;
    expect(byName.get('Science')?.grants).toEqual([helm]);
    expect(byName.get('Science')?.imports).toContain(helm);
    expect(byName.get('Host')?.grants).toEqual([]);
    expect(byName.get('Helm')?.grants).toEqual([]);
  });
});

describe('buildView', () => {
  it('keys the token of visible() through the canonicalizer', () => {
    const bp = compile({ root: Helm });
    const copy = new Token<INavComputer>('NavComputer');
    const canon = (token: AnyToken): AnyToken => (token === copy ? NAV : token);
    const parts = {
      phase: 'create' as const,
      complete: true,
      root: bp.root,
      modules: [...bp.modules.values()],
      records: bp.providers.values(),
      visibility: bp.visibility,
      moduleExports: bp.moduleExports,
      edges: bp.edges,
      replaced: new Map(),
      rewrittenBy: new Map(),
    };
    expect(buildView(parts, canon).visible('m0', copy)).toEqual(
      bp.visibility.get('m0')?.get(NAV),
    );
    expect(buildView(parts, (token) => token).visible('m0', copy)).toEqual([]);
  });
});

describe('build order on the view', () => {
  it('marks the edges that order a build and the providers built inline', () => {
    interface IReactorCore {
      readonly output: number;
    }
    const REACTOR = new Token<IReactorCore>('ReactorCore');
    const CORE = new Token<IReactorCore>('Core');
    const PROBE = new Token<object>('Probe');
    class FusionReactor implements IReactorCore {
      readonly output = 1.21;
    }
    class Console {
      static deps = [CORE, PROBE, lazy(REACTOR)] as const;
      constructor(
        readonly core: IReactorCore,
        readonly probe: object,
        readonly reactor: () => IReactorCore,
      ) {}
    }
    const view = viewOfBlueprint(
      compile({
        root: defineModule({
          name: 'Engineering',
          providers: [
            provide(REACTOR, { useClass: FusionReactor }),
            provide(CORE, { useExisting: REACTOR }),
            provide(PROBE, { lifetime: 'transient', useFactory: () => ({}) }),
            Console,
          ],
        }),
      }),
      sameToken,
    );
    const name = new Map(view.providers.map((p) => [p.id, p.name]));
    expect(view.providers.filter((p) => p.inline).map((p) => p.name)).toEqual([
      'Core',
      'Probe',
    ]);
    expect(
      view.edges
        .filter((e) => !e.ordersBuild)
        .map((e) => [name.get(e.from), name.get(e.to), e.kind]),
    ).toEqual([['Console', 'ReactorCore', 'lazy']]);
    expect(view.edges.every((e) => e.ordersBuild === (e.kind !== 'lazy'))).toBe(
      true,
    );
  });

  it('shows one unordered lazy edge per contribution of a lazy(all()) dep, written as the multi token', () => {
    const PANELS = new MultiToken<string>('Panels');
    const DESK = new Token<object>('Desk');
    const view = viewOfBlueprint(
      compile({
        root: defineModule({
          name: 'Bridge',
          providers: [
            provide(PANELS, { useValue: 'helm' }),
            provide(PANELS, { useValue: 'tactical' }),
            provide(DESK, {
              useFactory: () => ({}),
              deps: [lazy(all(PANELS))],
            }),
          ],
        }),
      }),
      sameToken,
    );
    const desk = view.providers.find((p) => p.name === 'Desk');
    const panels = view.providers.filter((p) => p.name === 'Panels');
    expect(panels).toHaveLength(2);
    expect(view.edges).toEqual(
      panels.map((p) => ({
        from: desk?.id,
        to: p.id,
        kind: 'lazy',
        written: PANELS,
        ordersBuild: false,
      })),
    );
  });
});
