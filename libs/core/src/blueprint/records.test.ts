import '../polyfill/symbol-metadata.js';

import { describe, expect, it } from 'vitest';

import { defineModule, moduleInternals } from '../definitions/define-module.js';
import { appendProp, writeInjectable } from '../definitions/metadata.js';
import { all, lazy, optional } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { REQUEST } from '../definitions/request.js';
import { MultiToken, Token } from '../definitions/token.js';
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
    ['null', null, 'is null, not a provider; create one with provide()'],
    [
      'a number',
      42,
      'is the number 42, not a provider; create one with provide()',
    ],
    [
      'a provider object without provide()',
      { token: NAV_CHARTS, useValue: 1 },
      'is an object, not a provider; create one with provide()',
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
      'a factory without deps',
      rawProvide(NAV_CHARTS, { useFactory: () => 1 }),
      'has a useFactory without a deps array; pass deps: [] for none',
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
      expect(errors).toMatchObject([{ code: 'NEXUS_INVALID_TOKEN', received }]);
    },
  );
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
  });
});
