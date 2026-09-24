import '../polyfill/symbol-metadata.js';

import { describe, expect, it } from 'vitest';

import { defineModule, moduleInternals } from '../definitions/define-module.js';
import { appendProp, writeInjectable } from '../definitions/metadata.js';
import { all, lazy, optional } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { REQUEST } from '../definitions/request.js';
import { MultiToken, Token } from '../definitions/token.js';
import type { Ctor } from '../definitions/types.js';
import type { NexusError } from '../errors/index.js';
import { normalizeProvider, optionsShape, tokenOfEntry } from './records.js';

class ReactorCore {
  output = 1.21;
}
class ShipComputer {
  constructor(readonly reactor: () => ReactorCore) {}
}
const NAV_CHARTS = new Token<{ plot(): string }>('NavCharts');
const DIAGNOSTICS = new MultiToken<{ run(): boolean }>('Diagnostics');
const SITE = { module: 'Engineering', index: 3 };
/** provide() without its types, for entries only JavaScript callers can write. */
const rawProvide = provide as (token: unknown, options?: unknown) => unknown;

function normalize(entry: unknown) {
  const errors: NexusError[] = [];
  const shape = normalizeProvider(entry, SITE, errors);
  return { shape, errors };
}

describe('normalizeProvider', () => {
  it('reads a bare parameterless class as a singleton with no deps', () => {
    expect(normalize(ReactorCore).shape).toMatchObject({
      kind: 'class',
      token: ReactorCore,
      lifetime: 'singleton',
      deps: [],
      props: [],
      useClass: ReactorCore,
    });
  });

  it('reports NEXUS_MISSING_DEPS for a bare class with parameters and no metadata', () => {
    const { shape, errors } = normalize(ShipComputer);
    expect(shape).toBeNull();
    expect(errors).toMatchObject([
      {
        code: 'NEXUS_MISSING_DEPS',
        token: 'ShipComputer',
        module: 'Engineering',
        arity: 1,
        message:
          '[NEXUS_MISSING_DEPS] ShipComputer in Engineering takes 1 constructor parameter and has no deps.\n' +
          '  Fix: declare static deps = [...] as const on ShipComputer, decorate it with @Injectable({ deps }), or list provide(ShipComputer, { deps: [...] }) in providers.',
      },
    ]);
  });

  it('accepts a bare class whose parameters all have defaults', () => {
    class Probe {
      constructor(
        readonly range = 10,
        ...rest: number[]
      ) {
        void rest;
      }
    }
    expect(normalize(Probe)).toMatchObject({
      shape: { kind: 'class', deps: [] },
      errors: [],
    });
  });

  it('reads deps and lifetime from @Injectable metadata on a bare class', () => {
    class Drone {
      constructor(readonly computer: ShipComputer) {}
    }
    const metadata = Object.create(null) as DecoratorMetadataObject;
    writeInjectable(metadata, { deps: [ShipComputer], lifetime: 'transient' });
    Object.defineProperty(Drone, Symbol.metadata, { value: metadata });
    expect(normalize(Drone).shape).toMatchObject({
      lifetime: 'transient',
      deps: [{ kind: 'required', token: ShipComputer }],
    });
  });

  it('reads property injections from metadata', () => {
    class Bridge {}
    const metadata = Object.create(null) as DecoratorMetadataObject;
    const set = () => undefined;
    appendProp(metadata, { key: 'charts', dep: optional(NAV_CHARTS), set });
    Object.defineProperty(Bridge, Symbol.metadata, { value: metadata });
    expect(normalize(Bridge).shape?.props).toEqual([
      { key: 'charts', dep: { kind: 'optional', token: NAV_CHARTS }, set },
    ]);
  });

  it('uses explicit provide() options and ignores metadata', () => {
    expect(
      normalize(
        provide(ShipComputer, {
          deps: [lazy(ReactorCore)],
          lifetime: 'scoped',
        }),
      ).shape,
    ).toMatchObject({
      kind: 'class',
      lifetime: 'scoped',
      deps: [{ kind: 'lazy', token: ReactorCore }],
    });
  });

  it('reports NEXUS_MISSING_DEPS for provide(C) on a class with parameters', () => {
    expect(normalize(rawProvide(ShipComputer)).errors).toMatchObject([
      { code: 'NEXUS_MISSING_DEPS' },
    ]);
  });

  it('reads useValue, including undefined, as a value with no lifetime', () => {
    expect(
      normalize(provide(NAV_CHARTS, { useValue: undefined as never })).shape,
    ).toMatchObject({
      kind: 'value',
      lifetime: null,
      value: undefined,
    });
  });

  it('accepts useValue with an explicit lifetime: undefined, like no lifetime key', () => {
    expect(
      normalize(rawProvide(NAV_CHARTS, { useValue: 1, lifetime: undefined }))
        .shape,
    ).toMatchObject({
      kind: 'value',
      lifetime: null,
      value: 1,
    });
  });

  it('reads useFactory with its deps and lifetime', () => {
    const useFactory = () => ({ plot: () => 'x' });
    expect(
      normalize(
        provide(NAV_CHARTS, {
          useFactory,
          deps: [all(DIAGNOSTICS)],
          lifetime: 'scoped',
        }),
      ).shape,
    ).toMatchObject({
      kind: 'factory',
      lifetime: 'scoped',
      deps: [{ kind: 'all', token: DIAGNOSTICS }],
      useFactory,
    });
  });

  it('reads useExisting as an alias', () => {
    const COMPUTER = new Token<ShipComputer>('Computer');
    expect(
      normalize(provide(COMPUTER, { useExisting: ShipComputer })).shape,
    ).toMatchObject({
      kind: 'alias',
      lifetime: null,
      target: ShipComputer,
    });
  });

  it('accepts useExisting with an explicit lifetime: undefined, like no lifetime key', () => {
    const COMPUTER = new Token<ShipComputer>('Computer');
    expect(
      normalize(
        rawProvide(COMPUTER, {
          useExisting: ShipComputer,
          lifetime: undefined,
        }),
      ).shape,
    ).toMatchObject({
      kind: 'alias',
      lifetime: null,
      target: ShipComputer,
    });
  });

  it.each([
    [
      'null',
      null,
      'is null, not a provider; list a class, a provide() result or a { token } literal',
    ],
    [
      'a number',
      42,
      'is the number 42, not a provider; list a class, a provide() result or a { token } literal',
    ],
    [
      'an object without an own token',
      Object.create({ token: NAV_CHARTS, useValue: 1 }) as object,
      'is an object, not a provider; list a class, a provide() result or a { token } literal',
    ],
    [
      'a literal whose options throw when read',
      {
        token: NAV_CHARTS,
        get useValue(): never {
          throw new Error('trap');
        },
      },
      'throws when its options are read: Error: trap',
    ],
    [
      'a module',
      defineModule({ name: 'Comms' }),
      'is the module Comms; add it to imports',
    ],
    [
      'a factory without a function',
      rawProvide(NAV_CHARTS, { useFactory: 5, deps: [] }),
      'has a useFactory that is not a function',
    ],
    [
      'factory deps that are not an array',
      rawProvide(NAV_CHARTS, { useFactory: () => 1, deps: 'nav' }),
      'has deps that are not an array',
    ],
    [
      'two definitions',
      rawProvide(NAV_CHARTS, { useValue: 1, useFactory: () => 1, deps: [] }),
      'sets useValue and useFactory; use one of them',
    ],
    [
      'a Token without a definition',
      rawProvide(NAV_CHARTS, {}),
      'provides NavCharts with no definition; add useClass, useValue, useFactory or useExisting',
    ],
    [
      'a bad lifetime',
      rawProvide(ReactorCore, { lifetime: 'forever' }),
      "has the lifetime the string \"forever\"; use 'singleton', 'scoped' or 'transient'",
    ],
    [
      'a lifetime on useValue',
      rawProvide(NAV_CHARTS, { useValue: 1, lifetime: 'singleton' }),
      'sets a lifetime on useValue; a value has none',
    ],
    [
      'a bare MultiToken dep',
      rawProvide(NAV_CHARTS, { useFactory: () => 1, deps: [DIAGNOSTICS] }),
      'deps[0] is the MultiToken Diagnostics; wrap it in all()',
    ],
    [
      'a dep that is not a token',
      rawProvide(NAV_CHARTS, { useFactory: () => 1, deps: ['nav'] }),
      'deps[0] is the string "nav", not a token',
    ],
    [
      'a MultiToken alias',
      rawProvide(NAV_CHARTS, { useExisting: DIAGNOSTICS }),
      'aliases the MultiToken Diagnostics; useExisting takes a class or a Token',
    ],
    [
      'REQUEST',
      provide(REQUEST, { useValue: {} }),
      'provides REQUEST, which createScope({ request }) supplies',
    ],
  ])('reports NEXUS_INVALID_PROVIDER for %s', (_label, entry, reason) => {
    const { shape, errors } = normalize(entry);
    expect(shape).toBeNull();
    expect(errors).toMatchObject([
      {
        code: 'NEXUS_INVALID_PROVIDER',
        module: 'Engineering',
        index: 3,
        reason,
      },
    ]);
  });

  it.each([
    ['a symbol', Symbol('nav'), 'the symbol Symbol(nav)'],
    ['a string', 'nav', 'the string "nav"'],
    ['undefined', undefined, 'undefined'],
  ])(
    'reports NEXUS_INVALID_TOKEN for a provider whose token is %s',
    (_label, token, received) => {
      const { errors } = normalize(rawProvide(token as never, { useValue: 1 }));
      expect(errors).toMatchObject([
        {
          code: 'NEXUS_INVALID_TOKEN',
          received,
          module: 'Engineering',
          index: 3,
          message: `[NEXUS_INVALID_TOKEN] Engineering.providers[3]: ${received} is not a token. A token is a class, a Token or a MultiToken.`,
        },
      ]);
    },
  );

  it('reports NEXUS_INVALID_TOKEN with the module and index for a useExisting target that is not a token', () => {
    const { errors } = normalize(
      rawProvide(NAV_CHARTS, { useExisting: Symbol('charts') }),
    );
    expect(errors).toMatchObject([
      {
        code: 'NEXUS_INVALID_TOKEN',
        received: 'the symbol Symbol(charts)',
        module: 'Engineering',
        index: 3,
        message:
          '[NEXUS_INVALID_TOKEN] Engineering.providers[3]: the symbol Symbol(charts) is not a token, so useExisting cannot alias it. A token is a class, a Token or a MultiToken.',
      },
    ]);
  });
});

describe('normalizeProvider with a provider literal', () => {
  class StarCharts {
    plot(): string {
      return 'sector 7';
    }
  }
  const plotCharts = (core: ReactorCore) => ({ plot: () => `${core.output}` });
  const check = { run: () => true };

  it.each([
    [
      'a class as its own token',
      { token: ShipComputer, deps: [lazy(ReactorCore)], lifetime: 'scoped' },
      provide(ShipComputer, { deps: [lazy(ReactorCore)], lifetime: 'scoped' }),
    ],
    ['a parameterless class', { token: ReactorCore }, provide(ReactorCore)],
    [
      'useClass',
      { token: NAV_CHARTS, useClass: StarCharts, deps: [] },
      provide(NAV_CHARTS, { useClass: StarCharts, deps: [] }),
    ],
    [
      'useValue undefined',
      { token: NAV_CHARTS, useValue: undefined },
      rawProvide(NAV_CHARTS, { useValue: undefined }),
    ],
    [
      'useFactory',
      {
        token: NAV_CHARTS,
        useFactory: plotCharts,
        deps: [ReactorCore],
        lifetime: 'transient',
      },
      provide(NAV_CHARTS, {
        useFactory: plotCharts,
        deps: [ReactorCore],
        lifetime: 'transient',
      }),
    ],
    [
      'useExisting',
      { token: NAV_CHARTS, useExisting: StarCharts },
      provide(NAV_CHARTS, { useExisting: StarCharts }),
    ],
    [
      'a MultiToken contribution',
      { token: DIAGNOSTICS, useValue: check },
      provide(DIAGNOSTICS, { useValue: check }),
    ],
    [
      'two definitions',
      { token: NAV_CHARTS, useValue: 1, useFactory: plotCharts, deps: [] },
      rawProvide(NAV_CHARTS, { useValue: 1, useFactory: plotCharts, deps: [] }),
    ],
    [
      'a bad lifetime',
      { token: ReactorCore, lifetime: 'forever' },
      rawProvide(ReactorCore, { lifetime: 'forever' }),
    ],
    [
      'a lifetime on useValue',
      { token: NAV_CHARTS, useValue: 1, lifetime: 'singleton' },
      rawProvide(NAV_CHARTS, { useValue: 1, lifetime: 'singleton' }),
    ],
    [
      'a factory without deps',
      { token: NAV_CHARTS, useFactory: plotCharts },
      rawProvide(NAV_CHARTS, { useFactory: plotCharts }),
    ],
    [
      'a bare MultiToken dep',
      { token: NAV_CHARTS, useFactory: plotCharts, deps: [DIAGNOSTICS] },
      rawProvide(NAV_CHARTS, { useFactory: plotCharts, deps: [DIAGNOSTICS] }),
    ],
    [
      'a token that is not a token',
      { token: 'nav', useValue: 1 },
      rawProvide('nav', { useValue: 1 }),
    ],
    [
      'REQUEST',
      { token: REQUEST, useValue: {} },
      provide(REQUEST, { useValue: {} }),
    ],
  ])(
    'reads %s exactly as it reads the provide() form',
    (_label, literal, provided) => {
      expect(normalize(literal)).toEqual(normalize(provided));
    },
  );

  it('defaults a factory without deps to no deps, in both forms', () => {
    const noArgs = () => ({ plot: () => 'x' });
    const expected = { kind: 'factory', deps: [], lifetime: 'singleton' };
    expect(
      normalize(provide(NAV_CHARTS, { useFactory: noArgs })).shape,
    ).toMatchObject(expected);
    expect(
      normalize({ token: NAV_CHARTS, useFactory: noArgs }).shape,
    ).toMatchObject(expected);
  });

  it('ignores a key that no provider form has', () => {
    expect(
      normalize({ token: DIAGNOSTICS, useValue: check, scope: 'request' }),
    ).toEqual(normalize(provide(DIAGNOSTICS, { useValue: check })));
  });

  it('ignores options that only the prototype chain supplies', () => {
    const literal = Object.assign(
      Object.create({ useValue: 'hijacked', lifetime: 'transient' }) as object,
      { token: ReactorCore },
    );
    expect(normalize(literal)).toEqual(normalize(provide(ReactorCore)));
  });

  it('reads a literal while Object.prototype carries token and useValue', () => {
    const proto = Object.prototype as Record<string, unknown>;
    proto['token'] = NAV_CHARTS;
    proto['useValue'] = 'hijacked';
    try {
      expect(normalize({}).errors).toMatchObject([
        { code: 'NEXUS_INVALID_PROVIDER' },
      ]);
      expect(normalize({ token: ReactorCore })).toEqual(
        normalize(provide(ReactorCore)),
      );
    } finally {
      delete proto['token'];
      delete proto['useValue'];
    }
  });
});

describe('normalizeProvider with static deps', () => {
  const NAME = new Token<string>('Name');
  const byName = [{ kind: 'required', token: NAME }];
  class Probe {
    static deps: readonly unknown[] = [NAME];
    constructor(readonly name: string) {}
  }

  it.each([
    ['a bare class', Probe],
    ['provide(C)', rawProvide(Probe)],
    ['provide(C, { lifetime })', rawProvide(Probe, { lifetime: 'scoped' })],
    ['a { token: C } literal', { token: Probe }],
    ['useClass', rawProvide(NAV_CHARTS, { useClass: Probe })],
  ])('reads static deps for %s', (_label, entry) => {
    expect(normalize(entry)).toMatchObject({
      shape: { kind: 'class', deps: byName },
      errors: [],
    });
  });

  it('uses an explicit deps option as a whole', () => {
    expect(
      normalize(rawProvide(Probe, { deps: [ReactorCore] })).shape?.deps,
    ).toEqual([{ kind: 'required', token: ReactorCore }]);
  });

  it("inherits a parent's static deps and prefers a subclass's own", () => {
    class Derived extends Probe {}
    class Rewired extends Probe {
      static override deps: readonly unknown[] = [ReactorCore];
    }
    expect(normalize(Derived).shape?.deps).toEqual(byName);
    expect(normalize(Rewired).shape?.deps).toEqual([
      { kind: 'required', token: ReactorCore },
    ]);
  });

  it('takes the lifetime from @Injectable and the deps from static deps', () => {
    class Scoped extends Probe {}
    const metadata = Object.create(null) as DecoratorMetadataObject;
    writeInjectable(metadata, { deps: undefined, lifetime: 'scoped' });
    Object.defineProperty(Scoped, Symbol.metadata, { value: metadata });
    expect(normalize(Scoped).shape).toMatchObject({
      lifetime: 'scoped',
      deps: byName,
    });
  });

  it.each([
    [
      'deps in both @Injectable and static deps',
      (() => {
        class Twice extends Probe {}
        const metadata = Object.create(null) as DecoratorMetadataObject;
        writeInjectable(metadata, { deps: [NAME], lifetime: undefined });
        Object.defineProperty(Twice, Symbol.metadata, { value: metadata });
        return Twice;
      })(),
      'declares deps in both @Injectable and static deps; keep one',
    ],
    [
      'a static deps that is not an array',
      class NotArray {
        static deps = 'name';
        constructor(readonly name: string) {}
      },
      'has a static deps that is not an array',
    ],
    [
      'a static deps getter that throws',
      class Trap {
        static get deps(): never {
          throw new Error('trap');
        }
        constructor(readonly name: string) {}
      },
      'has a static deps that throws when read: Error: trap',
    ],
    [
      'a static deps entry that is not a token',
      class Stringly {
        static deps = ['nav'];
        constructor(readonly name: string) {}
      },
      'deps[0] is the string "nav", not a token',
    ],
  ])('reports NEXUS_INVALID_PROVIDER for %s', (_label, entry, reason) => {
    expect(normalize(entry).errors).toMatchObject([
      { code: 'NEXUS_INVALID_PROVIDER', reason },
    ]);
  });

  it("gives useClass the class's @Injectable deps when the binding has none", () => {
    class Decorated {
      constructor(readonly name: string) {}
    }
    const metadata = Object.create(null) as DecoratorMetadataObject;
    writeInjectable(metadata, { deps: [NAME], lifetime: 'transient' });
    Object.defineProperty(Decorated, Symbol.metadata, { value: metadata });
    expect(
      normalize(rawProvide(NAV_CHARTS, { useClass: Decorated })).shape,
    ).toMatchObject({ kind: 'class', deps: byName, lifetime: 'singleton' });
    expect(
      normalize({ token: NAV_CHARTS, useClass: Decorated }).shape,
    ).toMatchObject({ kind: 'class', deps: byName, lifetime: 'singleton' });
  });

  it.each([
    ['provide(C)', (cls: Ctor) => rawProvide(cls)],
    [
      'provide(C, { lifetime })',
      (cls: Ctor) => rawProvide(cls, { lifetime: 'scoped' }),
    ],
    ['a { token: C } literal', (cls: Ctor) => ({ token: cls })],
  ] as const)(
    'reports NEXUS_MISSING_DEPS for %s when only @Injectable declares deps',
    (_label, wrap) => {
      // provide(C), provide(C, { lifetime }) and { token: C } never read
      // @Injectable for deps (spec §3.2): a class with only @Injectable
      // deps and no static deps behaves as if it declared none.
      class Decorated {
        constructor(readonly name: string) {}
      }
      const metadata = Object.create(null) as DecoratorMetadataObject;
      writeInjectable(metadata, { deps: [NAME], lifetime: undefined });
      Object.defineProperty(Decorated, Symbol.metadata, { value: metadata });
      const [error] = normalize(wrap(Decorated)).errors;
      expect(error).toMatchObject({
        code: 'NEXUS_MISSING_DEPS',
        token: 'Decorated',
        useClass: null,
        arity: 1,
        message:
          '[NEXUS_MISSING_DEPS] Decorated in Engineering takes 1 constructor parameter and has no deps.\n' +
          '  Fix: add deps to the binding, or declare static deps = [...] as const on Decorated. A binding of a class to itself does not read @Injectable deps.',
      });
    },
  );

  it('reports NEXUS_MISSING_DEPS naming the class and the token for a useClass that declares nothing', () => {
    class Bare {
      constructor(readonly name: string) {}
    }
    const [error] = normalize(
      rawProvide(NAV_CHARTS, { useClass: Bare }),
    ).errors;
    expect(error).toMatchObject({
      code: 'NEXUS_MISSING_DEPS',
      token: 'NavCharts',
      useClass: 'Bare',
      arity: 1,
    });
    expect(error?.message).toBe(
      '[NEXUS_MISSING_DEPS] Bare (useClass for NavCharts) in Engineering takes 1 constructor parameter and has no deps.\n' +
        '  Fix: add deps to the binding, declare static deps = [...] as const on Bare, or decorate it with @Injectable({ deps }).',
    );
  });

  it('gives the useClass fix for a useClass that names its own token', () => {
    class Bare {
      constructor(readonly name: string) {}
    }
    const [error] = normalize(rawProvide(Bare, { useClass: Bare })).errors;
    expect(error).toMatchObject({
      code: 'NEXUS_MISSING_DEPS',
      token: 'Bare',
      useClass: 'Bare',
    });
    expect(error?.message).toContain(
      'or decorate it with @Injectable({ deps })',
    );
  });

  it('reports deps in both @Injectable and static deps through useClass', () => {
    class Twice extends Probe {}
    const metadata = Object.create(null) as DecoratorMetadataObject;
    writeInjectable(metadata, { deps: [NAME], lifetime: undefined });
    Object.defineProperty(Twice, Symbol.metadata, { value: metadata });
    expect(
      normalize(rawProvide(NAV_CHARTS, { useClass: Twice })).errors,
    ).toMatchObject([
      {
        code: 'NEXUS_INVALID_PROVIDER',
        reason: 'declares deps in both @Injectable and static deps; keep one',
      },
    ]);
  });

  /** A class with both @Injectable deps and static deps, and a subclass that inherits both. */
  function classesWithBothDeclarations(): readonly [Ctor, Ctor] {
    class Twice extends Probe {}
    const metadata = Object.create(null) as DecoratorMetadataObject;
    writeInjectable(metadata, { deps: [NAME], lifetime: undefined });
    Object.defineProperty(Twice, Symbol.metadata, { value: metadata });
    class TwiceChild extends Twice {}
    return [Twice, TwiceChild];
  }

  it.each([
    ['provide(C)', (cls: Ctor) => rawProvide(cls)],
    [
      'provide(C, { lifetime })',
      (cls: Ctor) => rawProvide(cls, { lifetime: 'scoped' }),
    ],
    ['a { token: C } literal', (cls: Ctor) => ({ token: cls })],
  ] as const)(
    'reports deps in both @Injectable and static deps for %s, own and inherited',
    (_label, wrap) => {
      for (const cls of classesWithBothDeclarations()) {
        expect(normalize(wrap(cls)).errors).toMatchObject([
          {
            code: 'NEXUS_INVALID_PROVIDER',
            reason:
              'declares deps in both @Injectable and static deps; keep one',
          },
        ]);
      }
    },
  );

  it('ignores a deps key that only Function.prototype or Object.prototype carries', () => {
    const fn = Function.prototype as unknown as Record<string, unknown>;
    const obj = Object.prototype as Record<string, unknown>;
    fn['deps'] = [NAME];
    obj['deps'] = [NAME];
    try {
      class Plain {
        constructor(readonly name: string) {}
      }
      expect(normalize(Plain).errors).toMatchObject([
        { code: 'NEXUS_MISSING_DEPS', token: 'Plain' },
      ]);
    } finally {
      delete fn['deps'];
      delete obj['deps'];
    }
  });
});

describe('optionsShape', () => {
  it('provides the options token of a with() instance', () => {
    const OPTIONS = new Token<{ frequency: number }>('CommsOptions');
    const Comms = defineModule({ name: 'Comms', options: OPTIONS });
    const internals = moduleInternals(Comms.with({ frequency: 1420 }));
    expect(internals && optionsShape(internals, SITE, [])).toMatchObject({
      kind: 'value',
      token: OPTIONS,
      value: { frequency: 1420 },
    });
  });
});

describe('tokenOfEntry', () => {
  it('reads the token of a provider and of a bare class', () => {
    expect(tokenOfEntry(rawProvide(NAV_CHARTS, { useFactory: 5 }))).toBe(
      NAV_CHARTS,
    );
    expect(tokenOfEntry(ReactorCore)).toBe(ReactorCore);
    expect(tokenOfEntry(null)).toBeUndefined();
    expect(tokenOfEntry({ token: NAV_CHARTS, useValue: 1 })).toBe(NAV_CHARTS);
    expect(
      tokenOfEntry(Object.create({ token: NAV_CHARTS }) as object),
    ).toBeUndefined();
  });
});
