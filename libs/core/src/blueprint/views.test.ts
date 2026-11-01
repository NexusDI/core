import '../../test-support/symbol-metadata.js';

import { describe, expect, it } from 'vitest';

import {
  defineModule,
  type ProviderEntry,
} from '../definitions/define-module.js';
import type { AnyToken } from '../definitions/guards.js';
import { declareProperty } from '../definitions/metadata.js';
import { all, lazy, optional } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { MultiToken, Token } from '../definitions/token.js';
import { Nexus } from '../runtime/nexus.js';
import { check } from '../runtime/check.js';
import type { NexusPlugin } from '../runtime/plugins.js';
import { compile } from './compile.js';
import {
  buildView,
  type BlueprintView,
  type ProviderView,
  sameToken,
  viewOfBlueprint,
} from './views.js';

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

describe('loadImports on the view', () => {
  it('lists the module ids a load import gave a module, and none for the others', () => {
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
    expect(byName.get('Science')?.loadImports).toEqual([helm]);
    expect(byName.get('Science')?.imports).toContain(helm);
    expect(byName.get('Host')?.loadImports).toEqual([]);
    expect(byName.get('Helm')?.loadImports).toEqual([]);
  });
});

describe('configured on the view', () => {
  it('is true for a forRoot() and a forRootAsync() instance, false for a plain module and a loaded one', () => {
    const OPTIONS = new Token<{ readonly band: number }>('CommsOptions');
    const Comms = defineModule({ name: 'Comms', options: OPTIONS });
    const Relay = defineModule({ name: 'Relay', options: OPTIONS });
    const Science = defineModule({ name: 'Science' });
    const Host = defineModule({
      name: 'Host',
      imports: [
        Comms.forRoot({ band: 1 }),
        Relay.forRootAsync({ useFactory: () => ({ band: 2 }) }),
        Helm,
      ],
    });
    const first = compile({ root: Host });
    const bp = compile({
      root: Host,
      extraImports: [{ module: Science, imports: [Helm] }],
      previous: first,
    });
    const view = viewOfBlueprint(bp, sameToken);
    const configured = Object.fromEntries(
      view.modules.map((m) => [m.name, m.configured]),
    );
    expect(configured).toEqual({
      Host: false,
      Comms: true,
      Relay: true,
      Helm: false,
      Science: false,
    });
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
      bindings: bp.bindings,
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

describe('unresolved deps on the view', () => {
  interface ISubspaceLink {
    readonly channel: number;
  }
  interface ICommsArray {
    readonly link: ISubspaceLink | undefined;
  }
  const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
  const COMMS_ARRAY = new Token<ICommsArray>('CommsArray');
  const OTHER = new Token<ISubspaceLink>('Other');

  class PhasedArray implements ICommsArray {
    static deps = [optional(SUBSPACE_LINK)] as const;
    constructor(readonly link: ISubspaceLink | undefined) {}
  }

  function viewOf(
    providers: ProviderEntry[],
    plugins: NexusPlugin[] = [],
  ): BlueprintView {
    let seen: BlueprintView | undefined;
    check(defineModule({ name: 'Bridge', providers }), {
      plugins: [
        ...plugins,
        {
          name: 'reader',
          apiVersion: 1,
          compile: { check: (view) => void (seen = view) },
        },
      ],
    });
    if (seen === undefined) throw new Error('no view');
    return seen;
  }

  const providerOf = (view: BlueprintView, token: AnyToken): ProviderView => {
    const found = view.providers.find((p) => p.token === token);
    if (found === undefined) throw new Error('no provider');
    return found;
  };

  it('lists an optional dep with no provider, with the token the dependent named', () => {
    const view = viewOf([provide(COMMS_ARRAY, { useClass: PhasedArray })]);
    const array = providerOf(view, COMMS_ARRAY);
    expect(array.unresolved).toEqual([
      { kind: 'optional', written: SUBSPACE_LINK },
    ]);
    expect(view.edges.filter((e) => e.from === array.id)).toEqual([]);
  });

  it('lists nothing for an optional dep that bound', () => {
    const view = viewOf([
      provide(COMMS_ARRAY, { useClass: PhasedArray }),
      provide(SUBSPACE_LINK, { useValue: { channel: 4 } }),
    ]);
    const array = providerOf(view, COMMS_ARRAY);
    expect(array.unresolved).toEqual([]);
    expect(view.edges.map((e) => e.kind)).toEqual(['optional']);
  });

  it('lists every unresolved dep in deps order', () => {
    const A = new Token<string>('A');
    const B = new Token<string>('B');
    const C = new Token<string>('C');
    const view = viewOf([
      provide(B, { useValue: 'b' }),
      provide(COMMS_ARRAY, {
        useFactory: () => ({ link: undefined }),
        deps: [optional(A), B, optional(C)],
      }),
    ]);
    expect(
      providerOf(view, COMMS_ARRAY).unresolved.map((u) => u.written),
    ).toEqual([A, C]);
  });

  it('lists an unresolved optional constructor dep before an unresolved optional property', () => {
    const PROP_DEP = new Token<string>('PropDep');
    const CTOR_DEP = new Token<string>('CtorDep');
    class Beacon implements ICommsArray {
      readonly link = undefined;
      static deps = [optional(CTOR_DEP)] as const;
      constructor(readonly ctor: string | undefined) {}
    }
    const metadata = Object.create(null) as DecoratorMetadataObject;
    declareProperty(metadata, 'prop', optional(PROP_DEP));
    Object.defineProperty(Beacon, Symbol.metadata, { value: metadata });
    const view = viewOf([provide(COMMS_ARRAY, { useClass: Beacon })]);
    expect(
      providerOf(view, COMMS_ARRAY).unresolved.map((u) => u.written),
    ).toEqual([CTOR_DEP, PROP_DEP]);
  });

  it('shows a compile.provider hook an empty unresolved list', () => {
    const seen: (readonly unknown[])[] = [];
    viewOf(
      [provide(COMMS_ARRAY, { useClass: PhasedArray })],
      [
        {
          name: 'early',
          apiVersion: 1,
          compile: { provider: (p) => void seen.push(p.unresolved) },
        },
      ],
    );
    expect(seen).toEqual([[]]);
  });

  it('keeps the written token under a tokenKey plugin', () => {
    const view = viewOf(
      [provide(COMMS_ARRAY, { useClass: PhasedArray })],
      [
        {
          name: 'keys',
          apiVersion: 1,
          tokenKey: (token: unknown) =>
            token === SUBSPACE_LINK ? OTHER : undefined,
        },
      ],
    );
    expect(providerOf(view, COMMS_ARRAY).unresolved).toEqual([
      { kind: 'optional', written: SUBSPACE_LINK },
    ]);
  });

  it('gives construct hooks and context.blueprint() the same list', async () => {
    let constructed: ProviderView | undefined;
    let inContext: ProviderView | undefined;
    await Nexus.create(
      defineModule({
        name: 'Bridge',
        providers: [provide(COMMS_ARRAY, { useClass: PhasedArray })],
      }),
      {
        plugins: [
          {
            name: 'reader',
            apiVersion: 1,
            setup: (context) => {
              inContext = context
                .blueprint()
                .providers.find((p) => p.token === COMMS_ARRAY);
            },
            construct: (_, provider) => {
              if (provider.token === COMMS_ARRAY) constructed = provider;
              return undefined;
            },
          },
        ],
      },
    );
    const want = [{ kind: 'optional', written: SUBSPACE_LINK }];
    expect(constructed?.unresolved).toEqual(want);
    expect(inContext?.unresolved).toEqual(want);
    expect(Object.isFrozen(inContext?.unresolved)).toBe(true);
    expect(Object.isFrozen(inContext?.unresolved[0])).toBe(true);
    expect(Object.isFrozen(constructed?.unresolved)).toBe(true);
  });

  it('shares one empty list across providers with none', () => {
    const A = new Token<string>('A');
    const B = new Token<string>('B');
    const view = viewOf([
      provide(A, { useValue: 'a' }),
      provide(B, { useValue: 'b' }),
    ]);
    expect(providerOf(view, A).unresolved).toBe(providerOf(view, B).unresolved);
  });

  it('keeps the list on the view of a failed compile', () => {
    const MISSING = new Token<string>('Missing');
    class NeedsMissing {
      static deps = [MISSING] as const;
      constructor(readonly value: string) {}
    }
    let seen: BlueprintView | undefined;
    try {
      check(
        defineModule({
          name: 'Bridge',
          providers: [
            provide(COMMS_ARRAY, { useClass: PhasedArray }),
            NeedsMissing,
          ],
        }),
        {
          plugins: [
            {
              name: 'fmt',
              apiVersion: 1,
              formatError: (_e, view) => {
                seen = view;
                return undefined;
              },
            },
          ],
        },
      );
    } catch {
      // the missing provider is the point
    }
    if (seen === undefined) throw new Error('no view');
    expect(providerOf(seen, COMMS_ARRAY).unresolved).toEqual([
      { kind: 'optional', written: SUBSPACE_LINK },
    ]);
  });
});
