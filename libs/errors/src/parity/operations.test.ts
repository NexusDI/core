import { describe, expect, it } from 'vitest';

import {
  defineModule,
  MultiToken,
  Nexus,
  optional,
  provide,
  REQUEST,
  Token,
  type BlueprintError,
  type NexusError,
  type ProviderError,
} from '@nexusdi/core';

import { rejected, thrown } from '../../test-support/catch.js';
import { injectable } from '../../test-support/metadata.js';
import { errors } from '../index.js';

// The text mode of core's error tests. Each test runs the setup of the core
// test it names through a container with errors() registered, and asserts
// revision 1's message. Core's copy asserts the code, the fields and core's
// one-line message.

type Ctor = abstract new (...args: never[]) => unknown;

/** provide() without its types, for entries only JavaScript callers can write. */
const rawProvide = provide as (token: unknown, options?: unknown) => unknown;

class ReactorCore {
  output = 1.21;
}
class ShipComputer {
  constructor(readonly reactor: () => ReactorCore) {}
}
interface NavCharts {
  plot(): string;
}
const NAV_CHARTS = new Token<NavCharts>('NavCharts');
const DIAGNOSTICS = new MultiToken<{ run(): boolean }>('Diagnostics');
const charts: NavCharts = { plot: () => 'x' };

/** The inner errors of the BlueprintError Nexus.check throws for `root`, with errors() registered. */
function checkErrors(root: Parameters<typeof Nexus.check>[0]): NexusError[] {
  const error = thrown(() =>
    Nexus.check(root, { plugins: [errors()] }),
  ) as BlueprintError;
  return [...error.errors];
}

class Hull {}
class Deck {}
class Bay {}

/**
 * The inner errors for an Engineering module that lists `entry` fourth, at
 * index 3, where core's normalizeProvider tests place it.
 */
function errorsAt(entry: unknown): NexusError[] {
  return checkErrors(
    defineModule({
      name: 'Engineering',
      providers: [Hull, Deck, Bay, entry as never],
    }),
  );
}

/** Asserts that `entry` at index 3 of Engineering is reported once, with `message`. */
function expectAt(entry: unknown, message: string): void {
  const found = errorsAt(entry);
  expect(found).toHaveLength(1);
  expect(found[0]?.message).toBe(message);
}

describe('errors', () => {
  describe('normalizeProvider', () => {
    it('writes NEXUS_MISSING_DEPS for a bare class with parameters and no metadata', () => {
      expectAt(
        ShipComputer,
        '[NEXUS_MISSING_DEPS] ShipComputer in Engineering takes 1 constructor parameter and has no deps.\n' +
          '  Fix: declare static deps = [...] as const on ShipComputer, decorate it with @Injectable({ deps }), or list provide(ShipComputer, { deps: [...] }) in providers.',
      );
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
    ] as const)(
      'writes NEXUS_INVALID_PROVIDER for %s',
      (_label, entry, sentence) => {
        expectAt(
          entry,
          `[NEXUS_INVALID_PROVIDER] Engineering.providers[3] ${sentence}.`,
        );
      },
    );

    it.each([
      ['a symbol', Symbol('nav'), 'the symbol Symbol(nav)'],
      ['a string', 'nav', 'the string "nav"'],
      ['undefined', undefined, 'undefined'],
    ])(
      'writes NEXUS_INVALID_TOKEN for a provider whose token is %s',
      (_label, token, received) => {
        expectAt(
          rawProvide(token, { useValue: 1 }),
          `[NEXUS_INVALID_TOKEN] Engineering.providers[3]: ${received} is not a token. A token is a class, a Token or a MultiToken.`,
        );
      },
    );

    it('writes NEXUS_INVALID_TOKEN with the module and index for a useExisting target that is not a token', () => {
      expectAt(
        rawProvide(NAV_CHARTS, { useExisting: Symbol('charts') }),
        '[NEXUS_INVALID_TOKEN] Engineering.providers[3]: the symbol Symbol(charts) is not a token, so useExisting cannot alias it. A token is a class, a Token or a MultiToken.',
      );
    });
  });

  describe('normalizeProvider with static deps', () => {
    const NAME = new Token<string>('Name');
    class Probe {
      static deps: readonly unknown[] = [NAME];
      constructor(readonly name: string) {}
    }

    const forms: readonly (readonly [string, (cls: Ctor) => unknown])[] = [
      ['a bare class', (cls) => cls],
      ['provide(C)', (cls) => rawProvide(cls)],
      [
        'provide(C, { lifetime })',
        (cls) => rawProvide(cls, { lifetime: 'scoped' }),
      ],
      ['a { token: C } literal', (cls) => ({ token: cls })],
      [
        'provide() useClass',
        (cls) => rawProvide(NAV_CHARTS, { useClass: cls }),
      ],
      ['a useClass literal', (cls) => ({ token: NAV_CHARTS, useClass: cls })],
    ];
    const classErrors: readonly (readonly [string, () => Ctor, string])[] = [
      [
        'deps in both @Injectable and static deps',
        () => {
          class Twice extends Probe {}
          injectable(Twice, { deps: [NAME] });
          return Twice;
        },
        'declares deps in both @Injectable and static deps; keep one',
      ],
      [
        'a static deps that is not an array',
        () =>
          class NotArray {
            static deps = 'name';
            constructor(readonly name: string) {}
          },
        'has a static deps that is not an array',
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
      ],
      [
        'a static deps entry that is not a token',
        () =>
          class Stringly {
            static deps = ['nav'];
            constructor(readonly name: string) {}
          },
        'deps[0] is the string "nav", not a token',
      ],
    ];

    describe.each(forms)('through %s', (_form, wrap) => {
      it.each(classErrors)(
        'writes NEXUS_INVALID_PROVIDER for %s',
        (_label, make, sentence) => {
          expectAt(
            wrap(make()),
            `[NEXUS_INVALID_PROVIDER] Engineering.providers[3] ${sentence}.`,
          );
        },
      );
    });

    it.each([
      ['provide(C)', (cls: Ctor) => rawProvide(cls)],
      [
        'provide(C, { lifetime })',
        (cls: Ctor) => rawProvide(cls, { lifetime: 'scoped' }),
      ],
      ['a { token: C } literal', (cls: Ctor) => ({ token: cls })],
    ] as const)(
      'writes NEXUS_MISSING_DEPS for %s when only @Injectable declares deps',
      (_label, wrap) => {
        class Decorated {
          constructor(readonly name: string) {}
        }
        injectable(Decorated, { deps: [NAME], lifetime: undefined });
        expectAt(
          wrap(Decorated),
          '[NEXUS_MISSING_DEPS] Decorated in Engineering takes 1 constructor parameter and has no deps.\n' +
            '  Fix: add deps to the binding, or declare static deps = [...] as const on Decorated. A binding of a class to itself does not read @Injectable deps.',
        );
      },
    );

    it('writes NEXUS_MISSING_DEPS naming the class and the token for a useClass that declares nothing', () => {
      class Bare {
        constructor(readonly name: string) {}
      }
      expectAt(
        rawProvide(NAV_CHARTS, { useClass: Bare }),
        '[NEXUS_MISSING_DEPS] Bare (useClass for NavCharts) in Engineering takes 1 constructor parameter and has no deps.\n' +
          '  Fix: add deps to the binding, declare static deps = [...] as const on Bare, or decorate it with @Injectable({ deps }).',
      );
    });

    it('gives the useClass fix for a useClass that names its own token', () => {
      class Bare {
        constructor(readonly name: string) {}
      }
      const [error] = errorsAt(rawProvide(Bare, { useClass: Bare }));
      expect(error?.message).toContain(
        'or decorate it with @Injectable({ deps })',
      );
    });

    it('writes deps in both @Injectable and static deps through useClass', () => {
      class Twice extends Probe {}
      injectable(Twice, { deps: [NAME], lifetime: undefined });
      expectAt(
        rawProvide(NAV_CHARTS, { useClass: Twice }),
        '[NEXUS_INVALID_PROVIDER] Engineering.providers[3] declares deps in both @Injectable and static deps; keep one.',
      );
    });

    it.each([
      ['provide(C)', (cls: Ctor) => rawProvide(cls)],
      [
        'provide(C, { lifetime })',
        (cls: Ctor) => rawProvide(cls, { lifetime: 'scoped' }),
      ],
      ['a { token: C } literal', (cls: Ctor) => ({ token: cls })],
    ] as const)(
      'writes deps in both @Injectable and static deps for %s, own and inherited',
      (_label, wrap) => {
        class Twice extends Probe {}
        injectable(Twice, { deps: [NAME], lifetime: undefined });
        class TwiceChild extends Twice {}
        for (const cls of [Twice, TwiceChild])
          expectAt(
            wrap(cls),
            '[NEXUS_INVALID_PROVIDER] Engineering.providers[3] declares deps in both @Injectable and static deps; keep one.',
          );
      },
    );
  });

  describe('bind', () => {
    it('writes NEXUS_MISSING_PROVIDER with the requester, its module and a not-exported near miss', () => {
      const Tactical = defineModule({
        name: 'Tactical',
        providers: [provide(NAV_CHARTS, { useValue: charts })],
      });
      const Engineering = defineModule({
        name: 'Engineering',
        providers: [provide(ShipComputer, { deps: [NAV_CHARTS] as never })],
      });
      const found = checkErrors(
        defineModule({ name: 'Meridian', imports: [Engineering, Tactical] }),
      );
      expect(found).toMatchObject([
        { nearMisses: [{ kind: 'not-exported', module: 'Tactical' }] },
      ]);
      expect(found[0]?.message).toBe(
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
        checkErrors(defineModule({ name: 'Root', imports: [Comms, Tactical] })),
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
      expect(checkErrors(Engineering)).toMatchObject([
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
      expect(checkErrors(Root)).toMatchObject([
        { code: 'NEXUS_MISSING_PROVIDER', token: 'Probe', nearMisses: [] },
      ]);
    });
  });

  describe('compile', () => {
    it('writes a BlueprintError whose message lists each error on its own line', () => {
      const error = thrown(() =>
        Nexus.check(
          defineModule({
            name: 'Root',
            providers: [null as never, 42 as never],
          }),
          { plugins: [errors()] },
        ),
      ) as BlueprintError;
      expect(error.message.split('\n')).toEqual([
        '[NEXUS_BLUEPRINT_INVALID] the module graph has 2 errors; nothing was built.',
        '  [NEXUS_INVALID_PROVIDER] Root.providers[0] is null, not a provider; list a class, a provide() result or a { token } literal.',
        '  [NEXUS_INVALID_PROVIDER] Root.providers[1] is the number 42, not a provider; list a class, a provide() result or a { token } literal.',
      ]);
    });
  });

  describe('R18', () => {
    it('writes the full cycle path in NEXUS_CIRCULAR_DEPENDENCY', () => {
      class Helm {
        constructor(readonly nav: unknown) {}
      }
      class Navigation {
        constructor(readonly sensors: unknown) {}
      }
      class Sensors {
        constructor(readonly helm: unknown) {}
      }
      const Bridge = defineModule({
        name: 'Bridge',
        providers: [
          provide(Helm, { deps: [Navigation] }),
          provide(Navigation, { deps: [Sensors] }),
          provide(Sensors, { deps: [Helm] }),
        ],
      });
      const [error] = checkErrors(Bridge);
      expect(error?.message).toContain('Helm → Navigation → Sensors → Helm');
    });
  });

  describe('SEC-003 a polluted Object.prototype (CWE-1321)', () => {
    it('ignores provider options that only an inherited property supplies', () => {
      const NAME = new Token<string>('Name');
      const inherited = Object.create({ useValue: 'hijacked' }) as object;
      const found = checkErrors(
        defineModule({
          name: 'Root',
          providers: [rawProvide(NAME, inherited) as never],
        }),
      );
      expect(found.map((e) => e.message)).toEqual([
        '[NEXUS_INVALID_PROVIDER] Root.providers[0] provides Name with no definition; add useClass, useValue, useFactory or useExisting.',
      ]);
    });

    it('ignores literal options that only an inherited property supplies', () => {
      const NAME = new Token<string>('Name');
      const literal = Object.assign(
        Object.create({ useValue: 'hijacked' }) as object,
        { token: NAME },
      );
      const found = checkErrors(
        defineModule({ name: 'Root', providers: [literal as never] }),
      );
      expect(found.map((e) => e.message)).toEqual([
        '[NEXUS_INVALID_PROVIDER] Root.providers[0] provides Name with no definition; add useClass, useValue, useFactory or useExisting.',
      ]);
    });
  });

  describe('SEC-006 proxied classes (CWE-248)', () => {
    it('writes NEXUS_INVALID_PROVIDER for a proxied class whose trap throws while the compiler reads it', () => {
      class Engine {}
      const Hostile = new Proxy(Engine, {
        get(target, key, receiver) {
          if (typeof key === 'symbol') throw new Error('trap');
          return Reflect.get(target, key, receiver);
        },
      });
      const found = checkErrors(
        defineModule({ name: 'Root', providers: [Hostile] }),
      );
      expect(found.map((e) => e.message)).toEqual([
        '[NEXUS_INVALID_PROVIDER] Root.providers[0] is a class that throws when read: Error: trap.',
      ]);
    });
  });

  describe('SEC-012 static deps from a getter or a built-in prototype (CWE-1321)', () => {
    it('writes a static deps getter that throws as NEXUS_INVALID_PROVIDER', () => {
      class Probe {
        static get deps(): never {
          throw new Error('trap');
        }
        constructor(readonly input: unknown) {}
      }
      const found = checkErrors(
        defineModule({ name: 'Root', providers: [Probe] }),
      );
      expect(found.map((e) => e.message)).toEqual([
        '[NEXUS_INVALID_PROVIDER] Root.providers[0] has a static deps that throws when read: Error: trap.',
      ]);
    });
  });

  describe('startup', () => {
    it.each([
      ['a string', 'reactor offline', 'reactor offline'],
      ['undefined', undefined, 'undefined'],
      [
        'an object with a null prototype',
        Object.create(null) as object,
        '[object Object]',
      ],
    ])(
      'keeps a thrown %s as cause and still formats its message',
      async (_label, value, text) => {
        const NAME = new Token<string>('Name');
        const Root = defineModule({
          name: 'Root',
          providers: [
            provide(NAME, {
              useFactory: () => {
                throw value;
              },
              deps: [],
            }),
          ],
        });
        const error = (await rejected(
          Nexus.create(Root, { plugins: [errors()] }),
        )) as ProviderError;
        expect(error.cause).toBe(value);
        expect(error.message).toBe(
          `[NEXUS_PROVIDER_FAILED] Name (module Root) failed: ${text}`,
        );
      },
    );
  });

  describe('resolve', () => {
    class SubspaceLink {}
    const rawResolve = (
      target: { resolve(deps: never): unknown },
      deps: unknown,
    ) => target.resolve(deps as never);

    it('throws the error root get() throws for an entry it cannot find', async () => {
      const Comms = defineModule({
        name: 'Comms',
        providers: [SubspaceLink],
      });
      const ship = await Nexus.create(
        defineModule({ name: 'Meridian', imports: [Comms] }),
        { plugins: [errors()] },
      );
      const missing = thrown(() =>
        ship.resolve([optional(SubspaceLink), ReactorCore]),
      ) as NexusError;
      expect(
        missing.message.startsWith('[NEXUS_MISSING_PROVIDER] deps[1]'),
      ).toBe(true);
    });

    it('throws NEXUS_INVALID_TOKEN for an entry that is not a token, and for a bare MultiToken', async () => {
      const ship = await Nexus.create(defineModule({ name: 'Tactical' }), {
        plugins: [errors()],
      });
      const notAToken = thrown(() =>
        rawResolve(ship, { name: 'nav' }),
      ) as NexusError;
      expect(notAToken.message).toBe(
        '[NEXUS_INVALID_TOKEN] deps.name: the string "nav" is not a token. A token is a class, a Token or a MultiToken.',
      );
      const bare = thrown(() =>
        rawResolve(ship, { checks: DIAGNOSTICS }),
      ) as NexusError;
      expect(bare.message).toBe(
        '[NEXUS_INVALID_TOKEN] deps.checks: an object is the MultiToken Diagnostics; wrap it in all().',
      );
    });
  });

  describe('validate', () => {
    it('names the entry and the near misses in NEXUS_MISSING_PROVIDER', async () => {
      const OTHER = new Token<string>('NavCharts');
      const CHARTS = new Token<string>('NavCharts');
      const Science = defineModule({
        name: 'Science',
        providers: [provide(OTHER, { useValue: 'x' })],
        exports: [OTHER],
      });
      const ship = await Nexus.create(
        defineModule({ name: 'Meridian', imports: [Science] }),
        { plugins: [errors()] },
      );
      const error = thrown(() =>
        ship.validate({ charts: CHARTS }),
      ) as BlueprintError;
      expect(error.errors).toMatchObject([
        {
          code: 'NEXUS_MISSING_PROVIDER',
          token: 'NavCharts',
          requester: null,
          entry: 'deps.charts',
          module: 'Meridian',
          nearMisses: [{ kind: 'same-description', module: 'Science' }],
        },
      ]);
    });
  });

  describe('runInScope', () => {
    it('throws NEXUS_NO_SCOPE_CONTEXT without a scopeContext, naming nodeScopeContext', async () => {
      const ship = await Nexus.create(defineModule({ name: 'Root' }), {
        plugins: [errors()],
      });
      await using shuttle = await ship.createScope();
      const error = thrown(() =>
        ship.runInScope(shuttle, () => 1),
      ) as NexusError;
      expect(error.message).toContain('nodeScopeContext()');
    });
  });
});
