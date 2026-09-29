import '../../test-support/symbol-metadata.js';

import { describe, expect, it } from 'vitest';

import { defineModule, moduleInternals } from '../definitions/define-module.js';
import { declareClass, declareProperty } from '../definitions/metadata.js';
import { all, lazy, optional } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { REQUEST } from '../definitions/request.js';
import { MultiToken, Token } from '../definitions/token.js';
import type { Ctor } from '../definitions/types.js';
import type { NexusError } from '../errors/index.js';
import { expectCoreLine } from '../../test-support/modes.js';
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
        useClass: null,
        bare: true,
      },
    ]);
    expectCoreLine(errors[0] as NexusError);
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
    declareClass(metadata, { deps: [ShipComputer], lifetime: 'transient' });
    Object.defineProperty(Drone, Symbol.metadata, { value: metadata });
    expect(normalize(Drone).shape).toMatchObject({
      lifetime: 'transient',
      deps: [{ kind: 'required', token: ShipComputer }],
    });
  });

  it('reads property injections from metadata', () => {
    class Bridge {}
    const metadata = Object.create(null) as DecoratorMetadataObject;
    const calls: unknown[][] = [];
    const access = {
      set: (target: object, value: unknown) => void calls.push([target, value]),
    };
    declareProperty(metadata, 'charts', optional(NAV_CHARTS), access);
    Object.defineProperty(Bridge, Symbol.metadata, { value: metadata });
    const props = normalize(Bridge).shape?.props;
    expect(props).toEqual([
      {
        key: 'charts',
        dep: { kind: 'optional', token: NAV_CHARTS },
        set: expect.any(Function),
      },
    ]);
    const target = new Bridge();
    props?.[0]?.set(target, 'plotted');
    expect(calls).toEqual([[target, 'plotted']]);
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
      'not-a-provider',
      ['null'],
    ],
    [
      'a number',
      42,
      'is the number 42, not a provider; list a class, a provide() result or a { token } literal',
      'not-a-provider',
      ['the number 42'],
    ],
    [
      'an object without an own token',
      Object.create({ token: NAV_CHARTS, useValue: 1 }) as object,
      'is an object, not a provider; list a class, a provide() result or a { token } literal',
      'not-a-provider',
      ['an object'],
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
      'options-throw',
      ['Error: trap'],
    ],
    [
      'a module',
      defineModule({ name: 'Comms' }),
      'is the module Comms; add it to imports',
      'is-a-module',
      ['Comms'],
    ],
    [
      'a factory without a function',
      rawProvide(NAV_CHARTS, { useFactory: 5, deps: [] }),
      'has a useFactory that is not a function',
      'factory-not-a-function',
      [],
    ],
    [
      'factory deps that are not an array',
      rawProvide(NAV_CHARTS, { useFactory: () => 1, deps: 'nav' }),
      'has deps that are not an array',
      'deps-not-array',
      [],
    ],
    [
      'two definitions',
      rawProvide(NAV_CHARTS, { useValue: 1, useFactory: () => 1, deps: [] }),
      'sets useValue and useFactory; use one of them',
      'several-definitions',
      ['useValue and useFactory'],
    ],
    [
      'a Token without a definition',
      rawProvide(NAV_CHARTS, {}),
      'provides NavCharts with no definition; add useClass, useValue, useFactory or useExisting',
      'no-definition',
      ['NavCharts'],
    ],
    [
      'a bad lifetime',
      rawProvide(ReactorCore, { lifetime: 'forever' }),
      "has the lifetime the string \"forever\"; use 'singleton', 'scoped' or 'transient'",
      'bad-lifetime',
      ['the string "forever"'],
    ],
    [
      'a lifetime on useValue',
      rawProvide(NAV_CHARTS, { useValue: 1, lifetime: 'singleton' }),
      'sets a lifetime on useValue; a value has none',
      'value-with-lifetime',
      [],
    ],
    [
      'a bare MultiToken dep',
      rawProvide(NAV_CHARTS, { useFactory: () => 1, deps: [DIAGNOSTICS] }),
      'deps[0] is the MultiToken Diagnostics; wrap it in all()',
      'bad-dep',
      ['deps[0]', 'bare-multi-token', 'Diagnostics'],
    ],
    [
      'a dep that is not a token',
      rawProvide(NAV_CHARTS, { useFactory: () => 1, deps: ['nav'] }),
      'deps[0] is the string "nav", not a token',
      'bad-dep',
      ['deps[0]', 'not-a-token', 'the string "nav"'],
    ],
    [
      'a MultiToken alias',
      rawProvide(NAV_CHARTS, { useExisting: DIAGNOSTICS }),
      'aliases the MultiToken Diagnostics; useExisting takes a class or a Token',
      'alias-to-multi-token',
      ['Diagnostics'],
    ],
    [
      'REQUEST',
      provide(REQUEST, { useValue: {} }),
      'provides REQUEST, which createScope({ request }) supplies',
      'provides-request',
      [],
    ],
  ] as const)(
    'reports NEXUS_INVALID_PROVIDER for %s',
    (_label, entry, sentence, reason, detail) => {
      const { shape, errors } = normalize(entry);
      expect(shape).toBeNull();
      expect(errors).toMatchObject([
        {
          code: 'NEXUS_INVALID_PROVIDER',
          module: 'Engineering',
          index: 3,
          reason,
          detail,
        },
      ]);
      expectCoreLine(errors[0] as NexusError);
    },
  );

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
          reason: null,
        },
      ]);
      expectCoreLine(errors[0] as NexusError);
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
        reason: 'alias-target',
        detail: [],
      },
    ]);
    expectCoreLine(errors[0] as NexusError);
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

  it.each([
    [
      'options whose getter throws',
      {
        token: NAV_CHARTS,
        get useValue(): never {
          throw new Error('trap');
        },
      },
      rawProvide(NAV_CHARTS, {
        get useValue(): never {
          throw new Error('trap');
        },
      }),
    ],
    [
      'options that only the prototype chain supplies',
      Object.assign(
        Object.create({
          useValue: 'hijacked',
          lifetime: 'transient',
        }) as object,
        { token: ReactorCore },
      ),
      rawProvide(
        ReactorCore,
        Object.create({ useValue: 'hijacked', lifetime: 'transient' }),
      ),
    ],
    [
      'a deps option that only the prototype chain supplies',
      Object.assign(Object.create({ deps: [ReactorCore] }) as object, {
        token: ShipComputer,
      }),
      rawProvide(ShipComputer, Object.create({ deps: [ReactorCore] })),
    ],
  ])(
    'reads %s exactly as it reads the provide() form',
    (_label, literal, provided) => {
      expect(normalize(literal)).toEqual(normalize(provided));
    },
  );

  it('reads a literal and provide() options alike while Object.prototype carries every option key', () => {
    const proto = Object.prototype as Record<string, unknown>;
    const keys = [
      'useValue',
      'useFactory',
      'useExisting',
      'useClass',
      'lifetime',
      'deps',
    ];
    proto['useValue'] = 'hijacked';
    proto['useFactory'] = () => 'hijacked';
    proto['useExisting'] = NAV_CHARTS;
    proto['useClass'] = StarCharts;
    proto['lifetime'] = 'transient';
    proto['deps'] = [NAV_CHARTS];
    try {
      const expected = {
        shape: { kind: 'class', lifetime: 'singleton', deps: [] },
        errors: [],
      };
      expect(normalize({ token: ReactorCore })).toMatchObject(expected);
      expect(normalize(provide(ReactorCore))).toMatchObject(expected);
      expect(normalize(rawProvide(ReactorCore, {}))).toMatchObject(expected);
    } finally {
      for (const key of keys) delete proto[key];
    }
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
    declareClass(metadata, { deps: undefined, lifetime: 'scoped' });
    Object.defineProperty(Scoped, Symbol.metadata, { value: metadata });
    expect(normalize(Scoped).shape).toMatchObject({
      lifetime: 'scoped',
      deps: byName,
    });
  });

  // Every class form reads static deps and runs the conflict check, so each
  // reports these four errors the same way.
  const forms: readonly (readonly [string, (cls: Ctor) => unknown])[] = [
    ['a bare class', (cls) => cls],
    ['provide(C)', (cls) => rawProvide(cls)],
    [
      'provide(C, { lifetime })',
      (cls) => rawProvide(cls, { lifetime: 'scoped' }),
    ],
    ['a { token: C } literal', (cls) => ({ token: cls })],
    ['provide() useClass', (cls) => rawProvide(NAV_CHARTS, { useClass: cls })],
    ['a useClass literal', (cls) => ({ token: NAV_CHARTS, useClass: cls })],
  ];
  const classErrors: readonly (readonly [
    string,
    () => Ctor,
    string,
    string,
    readonly string[],
  ])[] = [
    [
      'deps in both @Injectable and static deps',
      () => {
        class Twice extends Probe {}
        const metadata = Object.create(null) as DecoratorMetadataObject;
        declareClass(metadata, { deps: [NAME] });
        Object.defineProperty(Twice, Symbol.metadata, { value: metadata });
        return Twice;
      },
      'declares deps in both @Injectable and static deps; keep one',
      'deps-in-both',
      [],
    ],
    [
      'a static deps that is not an array',
      () =>
        class NotArray {
          static deps = 'name';
          constructor(readonly name: string) {}
        },
      'has a static deps that is not an array',
      'static-deps-not-array',
      [],
    ],
    [
      'a static deps getter that throws',
      () =>
        class Trap {
          static get deps(): never {
            throw new Error('trap');
          }
          constructor(readonly name: string) {}
        },
      'has a static deps that throws when read: Error: trap',
      'static-deps-throws',
      ['Error: trap'],
    ],
    [
      'a static deps entry that is not a token',
      () =>
        class Stringly {
          static deps = ['nav'];
          constructor(readonly name: string) {}
        },
      'deps[0] is the string "nav", not a token',
      'bad-dep',
      ['deps[0]', 'not-a-token', 'the string "nav"'],
    ],
  ];
  describe.each(forms)('through %s', (_form, wrap) => {
    it.each(classErrors)(
      'reports NEXUS_INVALID_PROVIDER for %s',
      (_label, make, sentence, reason, detail) => {
        const { errors } = normalize(wrap(make()));
        expect(errors).toMatchObject([
          { code: 'NEXUS_INVALID_PROVIDER', reason, detail },
        ]);
        expectCoreLine(errors[0] as NexusError);
      },
    );
  });

  it("gives useClass the class's @Injectable deps when the binding has none", () => {
    class Decorated {
      constructor(readonly name: string) {}
    }
    const metadata = Object.create(null) as DecoratorMetadataObject;
    declareClass(metadata, { deps: [NAME], lifetime: 'transient' });
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
      declareClass(metadata, { deps: [NAME], lifetime: undefined });
      Object.defineProperty(Decorated, Symbol.metadata, { value: metadata });
      const [error] = normalize(wrap(Decorated)).errors;
      expect(error).toMatchObject({
        code: 'NEXUS_MISSING_DEPS',
        token: 'Decorated',
        useClass: null,
        arity: 1,
        bare: false,
      });
      expectCoreLine(error as NexusError);
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
      bare: false,
    });
    expectCoreLine(error as NexusError);
  });

  it('reports NEXUS_MISSING_DEPS for a useClass that names its own token', () => {
    class Bare {
      constructor(readonly name: string) {}
    }
    const [error] = normalize(rawProvide(Bare, { useClass: Bare })).errors;
    expect(error).toMatchObject({
      code: 'NEXUS_MISSING_DEPS',
      token: 'Bare',
      useClass: 'Bare',
    });
    expectCoreLine(error as NexusError);
  });

  it('reports deps in both @Injectable and static deps through useClass', () => {
    class Twice extends Probe {}
    const metadata = Object.create(null) as DecoratorMetadataObject;
    declareClass(metadata, { deps: [NAME], lifetime: undefined });
    Object.defineProperty(Twice, Symbol.metadata, { value: metadata });
    const { errors } = normalize(rawProvide(NAV_CHARTS, { useClass: Twice }));
    expect(errors).toMatchObject([
      { code: 'NEXUS_INVALID_PROVIDER', reason: 'deps-in-both', detail: [] },
    ]);
    expectCoreLine(errors[0] as NexusError);
  });

  /** A class with both @Injectable deps and static deps, and a subclass that inherits both. */
  function classesWithBothDeclarations(): readonly [Ctor, Ctor] {
    class Twice extends Probe {}
    const metadata = Object.create(null) as DecoratorMetadataObject;
    declareClass(metadata, { deps: [NAME], lifetime: undefined });
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
        const { errors } = normalize(wrap(cls));
        expect(errors).toMatchObject([
          {
            code: 'NEXUS_INVALID_PROVIDER',
            reason: 'deps-in-both',
            detail: [],
          },
        ]);
        expectCoreLine(errors[0] as NexusError);
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
