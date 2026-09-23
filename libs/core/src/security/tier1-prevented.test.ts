/**
 * Tier 1: hostile inputs the container prevents. One describe per entry of
 * libs/core/SECURITY.md, titled with its identifier.
 */
import '../polyfill/symbol-metadata.js';

import { describe, expect, it } from 'vitest';

import { compileErrors } from '../../test-support/compile.js';
import {
  expectPlainGraph,
  extraKeys,
  moduleChain,
  snapshotBuiltins,
} from '../../test-support/security.js';
import { compile } from '../blueprint/compile.js';
import { registerModuleClass } from '../definitions/define-module.js';
import {
  INJECTABLE,
  PROPS,
  appendProp,
  writeInjectable,
} from '../definitions/metadata.js';
import {
  MultiToken,
  Nexus,
  Token,
  defineModule,
  lazy,
  optional,
  provide,
  type StandardSchemaV1,
} from '../index.js';

const rawProvide = provide as (token: unknown, options?: unknown) => never;
const NAMES = ['__proto__', 'constructor', 'prototype'] as const;
const polluted = () => (Object.prototype as { polluted?: unknown }).polluted;

describe('SEC-001 prototype names as tokens and modules (CWE-1321)', () => {
  it.each(NAMES)(
    'resolves a Token described %s in a module of that name',
    async (name) => {
      const TOKEN = new Token<string>(name);
      const Named = defineModule({
        name,
        providers: [provide(TOKEN, { useValue: 'safe' })],
        exports: [TOKEN],
      });
      await using ship = await Nexus.create(
        defineModule({ name: 'Root', imports: [Named] }),
      );
      expect(ship.get(TOKEN)).toBe('safe');
      expect(ship.get(TOKEN, { module: Named })).toBe('safe');
      expect(ship.graph().modules[1]?.name).toBe(name);
    },
  );

  it.each(NAMES)('names %s in a missing-provider error', (name) => {
    const TOKEN = new Token<string>(name);
    class Needy {
      constructor(readonly value: string) {}
    }
    expect(
      compileErrors(
        defineModule({ name, providers: [provide(Needy, { deps: [TOKEN] })] }),
      ),
    ).toMatchObject([
      {
        code: 'NEXUS_MISSING_PROVIDER',
        token: name,
        requester: 'Needy',
        module: name,
      },
    ]);
  });
});

describe('SEC-002 options carrying prototype keys (CWE-1321)', () => {
  const OPTIONS = new Token<Record<string, unknown>>('CommsOptions');
  const hostile = () =>
    JSON.parse(
      '{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}, "frequency": 1420}',
    ) as Record<string, unknown>;

  it('passes an options object with __proto__ and constructor keys through with() as given', async () => {
    const value = hostile();
    const Comms = defineModule({
      name: 'Comms',
      options: OPTIONS,
      exports: [OPTIONS],
    });
    await using ship = await Nexus.create(
      defineModule({ name: 'Root', imports: [Comms.with(value)] }),
    );
    expect(ship.get(OPTIONS)).toBe(value);
    expect(Object.hasOwn(value, '__proto__')).toBe(true);
    expect(polluted()).toBeUndefined();
  });

  it('passes the same object through a schema that returns its input', async () => {
    const identity: StandardSchemaV1<unknown, Record<string, unknown>> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (v) => ({ value: v as Record<string, unknown> }),
      },
    };
    const value = hostile();
    const Comms = defineModule({
      name: 'Comms',
      options: OPTIONS,
      schema: identity,
      exports: [OPTIONS],
    });
    await using ship = await Nexus.create(
      defineModule({ name: 'Root', imports: [Comms.with(value)] }),
    );
    expect(ship.get(OPTIONS)).toBe(value);
    expect(polluted()).toBeUndefined();
  });

  it('reads an options value whose prototype carries useFactory and deps as a value', async () => {
    const value = Object.create({
      useFactory: () => ({ hijacked: true }),
      deps: [],
    }) as Record<string, unknown>;
    const Comms = defineModule({
      name: 'Comms',
      options: OPTIONS,
      exports: [OPTIONS],
    });
    await using ship = await Nexus.create(
      defineModule({ name: 'Root', imports: [Comms.with(value)] }),
    );
    expect(ship.get(OPTIONS)).toBe(value);
  });
});

describe('SEC-003 a polluted Object.prototype (CWE-1321)', () => {
  it('ignores provider options that only an inherited property supplies', () => {
    const NAME = new Token<string>('Name');
    const inherited = Object.create({ useValue: 'hijacked' }) as object;
    expect(
      compileErrors(
        defineModule({
          name: 'Root',
          providers: [rawProvide(NAME, inherited)],
        }),
      ),
    ).toMatchObject([
      {
        code: 'NEXUS_INVALID_PROVIDER',
        reason:
          'provides Name with no definition; add useClass, useValue, useFactory or useExisting',
      },
    ]);
  });

  it('ignores literal options that only an inherited property supplies', () => {
    const NAME = new Token<string>('Name');
    const literal = Object.assign(
      Object.create({ useValue: 'hijacked' }) as object,
      { token: NAME },
    );
    expect(
      compileErrors(
        defineModule({ name: 'Root', providers: [literal as never] }),
      ),
    ).toMatchObject([
      {
        code: 'NEXUS_INVALID_PROVIDER',
        reason:
          'provides Name with no definition; add useClass, useValue, useFactory or useExisting',
      },
    ]);
  });

  it('reads provide() options the same way while Object.prototype carries useValue and lifetime', async () => {
    const proto = Object.prototype as Record<string, unknown>;
    proto['useValue'] = 'hijacked';
    proto['lifetime'] = 'transient';
    try {
      class Reactor {}
      await using ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [provide(Reactor, { deps: [] })],
        }),
      );
      expect(ship.get(Reactor)).toBeInstanceOf(Reactor);
      expect(ship.get(Reactor)).toBe(ship.get(Reactor));
    } finally {
      delete proto['useValue'];
      delete proto['lifetime'];
    }
  });

  it('resolves a bare class as a singleton while Object.prototype carries lifetime', async () => {
    const proto = Object.prototype as Record<string, unknown>;
    proto['lifetime'] = 'transient';
    try {
      class Reactor {}
      await using ship = await Nexus.create(
        defineModule({ name: 'Root', providers: [Reactor] }),
      );
      expect(ship.get(Reactor)).toBeInstanceOf(Reactor);
      expect(ship.get(Reactor)).toBe(ship.get(Reactor));
    } finally {
      delete proto['lifetime'];
    }
  });
});

describe('SEC-004 metadata and Object.prototype (CWE-1321)', () => {
  it('reads no injection metadata from Object.prototype, even through a metadata object that inherits from it', () => {
    class Missing {}
    const proto = Object.prototype as unknown as Record<symbol, unknown>;
    proto[INJECTABLE] = { deps: [Missing], lifetime: 'transient' };
    try {
      class Plain {}
      Object.defineProperty(Plain, Symbol.metadata, { value: {} });
      const bp = compile({
        root: defineModule({ name: 'Root', providers: [Plain] }),
      });
      expect(bp.providers.get('p0')).toMatchObject({
        lifetime: 'singleton',
        deps: [],
      });
    } finally {
      delete proto[INJECTABLE];
    }
  });

  it('writes metadata as own keys of the metadata object and leaves Object.prototype alone', () => {
    const metadata = {} as DecoratorMetadataObject;
    writeInjectable(metadata, { deps: [], lifetime: undefined });
    appendProp(metadata, {
      key: 'probe',
      dep: optional(new Token<string>('Probe')),
      set: () => undefined,
    });
    expect(Object.getOwnPropertySymbols(metadata)).toEqual([INJECTABLE, PROPS]);
    expect(extraKeys('Object.prototype')).toEqual([]);
  });

  it('builds a class that extends Object directly', async () => {
    class Reactor {}
    class Direct extends Object {
      constructor(readonly reactor: Reactor) {
        super();
      }
    }
    await using ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [Reactor, provide(Direct, { deps: [Reactor] })],
      }),
    );
    expect(ship.get(Direct).reactor).toBe(ship.get(Reactor));
  });
});

describe('SEC-005 frozen classes (CWE-471)', () => {
  it('registers, builds and wires frozen classes, prototypes and module classes', async () => {
    class Reactor {}
    class Computer {
      constructor(readonly reactor: Reactor) {}
    }
    Object.freeze(Reactor);
    Object.freeze(Computer);
    Object.freeze(Computer.prototype);
    class Command {}
    registerModuleClass(
      Object.freeze(Command),
      defineModule({
        name: 'Command',
        providers: [Reactor, provide(Computer, { deps: [Reactor] })],
        exports: [Computer],
      }),
    );
    await using ship = await Nexus.create(Command);
    expect(ship.get(Computer).reactor).toBeInstanceOf(Reactor);
  });
});

describe('SEC-006 proxied classes (CWE-248)', () => {
  it('builds a class behind a transparent Proxy under the proxy identity', async () => {
    class Engine {
      output = 1.21;
    }
    const Proxied = new Proxy(Engine, {});
    await using ship = await Nexus.create(
      defineModule({ name: 'Root', providers: [Proxied] }),
    );
    expect(ship.get(Proxied)).toBeInstanceOf(Engine);
    expect(ship.has(Engine)).toBe(false);
    expect(ship.graph().providers[0]?.token).toBe('Engine');
  });

  it('reports NEXUS_INVALID_PROVIDER for a proxied class whose trap throws while the compiler reads it', () => {
    class Engine {}
    const Hostile = new Proxy(Engine, {
      get(target, key, receiver) {
        if (typeof key === 'symbol') throw new Error('trap');
        return Reflect.get(target, key, receiver);
      },
    });
    expect(
      compileErrors(defineModule({ name: 'Root', providers: [Hostile] })),
    ).toMatchObject([
      {
        code: 'NEXUS_INVALID_PROVIDER',
        index: 0,
        reason: 'is a class that throws when read: Error: trap',
      },
    ]);
  });
});

describe('SEC-007 classes with a null prototype chain (CWE-754)', () => {
  it('builds a class that extends null and returns its own instance', async () => {
    class Void extends null {
      constructor() {
        return Object.create(Void.prototype) as Void;
      }
    }
    await using ship = await Nexus.create(
      defineModule({ name: 'Root', providers: [Void] }),
    );
    expect(ship.get(Void)).toBeInstanceOf(Void);
  });

  it('builds a class whose static prototype is null, with and without own metadata', async () => {
    class Beacon {}
    class Relay {
      constructor(readonly beacon: Beacon) {}
    }
    const metadata = Object.create(null) as DecoratorMetadataObject;
    writeInjectable(metadata, { deps: [Beacon], lifetime: 'transient' });
    Object.defineProperty(Relay, Symbol.metadata, { value: metadata });
    Object.setPrototypeOf(Beacon, null);
    Object.setPrototypeOf(Relay, null);
    await using ship = await Nexus.create(
      defineModule({ name: 'Root', providers: [Beacon, Relay] }),
    );
    expect(ship.get(Relay).beacon).toBe(ship.get(Beacon));
    expect(ship.get(Relay)).not.toBe(ship.get(Relay));
  });
});

describe('SEC-008 repeated entries (CWE-407)', () => {
  const N = 20_000;

  it('holds one provider entry listed many times once', () => {
    class Reactor {}
    const DIAGNOSTICS = new MultiToken<string>('Diagnostics');
    const hull = provide(DIAGNOSTICS, { useValue: 'hull' });
    const bp = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          ...Array<typeof Reactor>(N).fill(Reactor),
          ...Array<typeof hull>(N).fill(hull),
        ],
      }),
    });
    expect(bp.providers.size - 1).toBe(2);
  });

  it('holds one module imported many times once', () => {
    const Engineering = defineModule({ name: 'Engineering' });
    const bp = compile({
      root: defineModule({
        name: 'Root',
        imports: Array<typeof Engineering>(N).fill(Engineering),
      }),
    });
    expect(bp.modules.size).toBe(2);
    expect(bp.modules.get('m0')?.imports).toEqual(['m1']);
  });

  it('compiles and resolves many distinct contributions to one MultiToken', async () => {
    const READINGS = new MultiToken<number>('Readings');
    const providers = Array.from({ length: N }, (_, i) =>
      provide(READINGS, { useValue: i }),
    );
    await using ship = await Nexus.create(
      defineModule({ name: 'Root', providers }),
    );
    expect(ship.get(READINGS)).toHaveLength(N);
  });
});

describe('SEC-009 deep chains (CWE-674)', { timeout: 60_000 }, () => {
  it('compiles, builds and disposes 1,000 modules, each importing, re-exporting and depending on the next', async () => {
    const { root, head } = moduleChain(1_000);
    await using ship = await Nexus.create(root);
    expect(ship.get(head)).toBe(1_000);
  });

  it('reports a 1,000-provider dependency cycle with its full path', () => {
    const tokens = Array.from(
      { length: 1_000 },
      (_, i) => new Token<number>(`Ring${i}`),
    );
    const providers = tokens.map((token, i) =>
      provide(token, {
        useFactory: (n: number) => n,
        deps: [tokens[(i + 1) % tokens.length]!],
      }),
    );
    const [error] = compileErrors(defineModule({ name: 'Ring', providers }));
    expect(error).toMatchObject({ code: 'NEXUS_CIRCULAR_DEPENDENCY' });
    expect((error as unknown as { path: string[] }).path).toHaveLength(1_001);
  });
});

describe('SEC-010 graph() stays plain JSON (CWE-20)', () => {
  it('returns plain JSON for prototype names, proxies, null chains, repeats and deep chains', async () => {
    class Engine {}
    class Void extends null {
      constructor() {
        return Object.create(Void.prototype) as Void;
      }
    }
    const PROTO = new Token<string>('__proto__');
    const Proto = defineModule({
      name: 'constructor',
      providers: [provide(PROTO, { useValue: 'x' })],
      exports: [PROTO],
    });
    const { root: Deep } = moduleChain(50);
    const Root = defineModule({
      name: 'prototype',
      imports: [Proto, Proto, Deep],
      providers: [new Proxy(Engine, {}), Void, Void],
    });
    await using ship = await Nexus.create(Root);
    expectPlainGraph(ship.graph());
  });
});

describe('SEC-012 static deps from a getter or a built-in prototype (CWE-1321)', () => {
  it('reports a static deps getter that throws as NEXUS_INVALID_PROVIDER', () => {
    class Probe {
      static get deps(): never {
        throw new Error('trap');
      }
      constructor(readonly input: unknown) {}
    }
    expect(
      compileErrors(defineModule({ name: 'Root', providers: [Probe] })),
    ).toMatchObject([
      {
        code: 'NEXUS_INVALID_PROVIDER',
        reason: 'has a static deps that throws when read: Error: trap',
      },
    ]);
  });

  it('ignores a deps key that Function.prototype or Object.prototype carries', () => {
    class Hijacked {}
    const fn = Function.prototype as unknown as Record<string, unknown>;
    const obj = Object.prototype as Record<string, unknown>;
    fn['deps'] = [Hijacked];
    obj['deps'] = [Hijacked];
    try {
      class Probe {
        constructor(readonly input: unknown) {}
      }
      expect(
        compileErrors(defineModule({ name: 'Root', providers: [Probe] })),
      ).toMatchObject([{ code: 'NEXUS_MISSING_DEPS', token: 'Probe' }]);
    } finally {
      delete fn['deps'];
      delete obj['deps'];
    }
  });

  it("reads a parent class's own static deps for a subclass that declares none", async () => {
    const NAME = new Token<string>('Name');
    class Base {
      static deps = [NAME] as const;
      constructor(readonly name: string) {}
    }
    class Derived extends Base {}
    await using ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [provide(NAME, { useValue: 'Meridian' }), Derived],
      }),
    );
    expect(ship.get(Derived).name).toBe('Meridian');
  });
});

describe('SEC-011 no global writes (CWE-471)', () => {
  it('leaves every built-in prototype, Symbol and globalThis unchanged across create, get, scopes, load and disposal', async () => {
    const before = snapshotBuiltins();
    class Reactor {
      [Symbol.dispose]() {}
    }
    class Drone {}
    class Monitor {
      constructor(readonly reactor: () => Reactor) {}
    }
    const MISSION = new Token<string>('Mission');
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          Reactor,
          provide(Drone, { lifetime: 'transient' }),
          provide(Monitor, { deps: [lazy(Reactor)] }),
          provide(MISSION, {
            useFactory: () => 'survey',
            deps: [],
            lifetime: 'scoped',
          }),
        ],
      }),
    );
    ship.get(Monitor).reactor();
    ship.get(Drone);
    await ship.load(
      defineModule({
        name: 'Science',
        providers: [provide(new Token<number>('Probe'), { useValue: 1 })],
      }),
    );
    const shuttle = await ship.createScope();
    shuttle.get(MISSION);
    await ship[Symbol.asyncDispose]();
    expect(snapshotBuiltins()).toEqual(before);
  });

  it('adds only the documented polyfill symbols to Symbol and nothing to the built-in prototypes', () => {
    for (const key of extraKeys('Symbol'))
      expect(['metadata', 'dispose', 'asyncDispose']).toContain(key);
    expect(extraKeys('Object.prototype')).toEqual([]);
    expect(extraKeys('Function.prototype')).toEqual([]);
    expect(extraKeys('Array.prototype')).toEqual([]);
  });
});
