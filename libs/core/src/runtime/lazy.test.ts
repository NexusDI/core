import { describe, expect, it } from 'vitest';

import { rejected, thrown } from '../../test-support/catch.js';
import { deferred, flush } from '../../test-support/deferred.js';
import { compile } from '../blueprint/compile.js';
import {
  defineModule,
  type ModuleRef,
  type ProviderEntry,
} from '../definitions/define-module.js';
import { all, lazy } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { MultiToken, Token } from '../definitions/token.js';
import { makeListThunk, makeThunk, type ResolveId } from './lazy.js';
import { coreText } from '../text/index.js';
import { Nexus } from './nexus.js';
import { rootState } from '../../test-support/root-state.js';
import type { TransientOwner } from './state.js';
import { Tracer } from './trace.js';

class ShieldGrid {
  constructor(readonly router: PowerRouter) {}
  draw() {
    return 0.4;
  }
}
class PowerRouter {
  constructor(readonly shields: () => ShieldGrid) {}
  divert() {
    return this.shields().draw();
  }
}

describe('lazy', () => {
  it('resolves a lazy cycle once startup has finished', async () => {
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [
        provide(PowerRouter, { deps: [lazy(ShieldGrid)] }),
        provide(ShieldGrid, { deps: [PowerRouter] }),
      ],
    });
    const ship = await Nexus.create(Engineering);
    const router = ship.get(PowerRouter);
    expect(router.divert()).toBe(0.4);
    expect(router.shields()).toBe(ship.get(ShieldGrid));
    expect(ship.get(ShieldGrid).router).toBe(router);
  });

  it('throws NEXUS_NOT_READY when a constructor calls a thunk during startup', async () => {
    class EagerRouter {
      constructor(shields: () => ShieldGrid) {
        shields();
      }
    }
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [
        provide(EagerRouter, { deps: [lazy(ShieldGrid)] }),
        provide(ShieldGrid, { deps: [EagerRouter as never] }),
      ],
    });
    const error = await rejected(Nexus.create(Engineering));
    expect(error).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      token: 'EagerRouter',
      cause: {
        code: 'NEXUS_NOT_READY',
        owner: 'EagerRouter',
        target: 'ShieldGrid',
        path: [],
      },
    });
  });

  it('throws NEXUS_NOT_READY for a target that is built and not yet ready', async () => {
    class Reactor {}
    class Monitor {
      constructor(reactor: Reactor, again: () => Reactor) {
        void reactor;
        again();
      }
    }
    const Root = defineModule({
      name: 'Root',
      providers: [
        Reactor,
        provide(Monitor, { deps: [Reactor, lazy(Reactor)] }),
      ],
    });
    expect(await rejected(Nexus.create(Root))).toMatchObject({
      cause: { code: 'NEXUS_NOT_READY', target: 'Reactor' },
    });
  });

  it('throws NEXUS_NOT_READY, never a cycle error, from an async continuation whose target is in flight', async () => {
    const A = new Token<string>('A');
    const B = new Token<string>('B');
    const gateA = deferred();
    const gateB = deferred<string>();
    const Root = defineModule({
      name: 'Root',
      providers: [
        provide(A, {
          useFactory: async (b) => {
            await gateA.promise;
            return b();
          },
          deps: [lazy(B)],
        }),
        provide(B, { useFactory: () => gateB.promise, deps: [] }),
      ],
    });
    const creating = Nexus.create(Root);
    gateA.resolve();
    await flush();
    gateB.resolve('b');
    expect(await rejected(creating)).toMatchObject({
      token: 'A',
      cause: {
        code: 'NEXUS_NOT_READY',
        owner: 'A',
        target: 'B',
        provider: null,
        path: [],
      },
    });
  });

  it('names the token the thunk was given and the provider an alias reaches when a lazy(ALIAS) thunk runs too early', async () => {
    interface IAlpha {
      readonly n: number;
    }
    const ALPHA = new Token<IAlpha>('Alpha');
    const ALIAS = new Token<IAlpha>('Alias');
    class Consumer {
      constructor(alias: () => IAlpha) {
        alias();
      }
    }
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Test',
          providers: [
            provide(Consumer, { deps: [lazy(ALIAS)] }),
            provide(ALPHA, { useFactory: () => ({ n: 1 }), deps: [Consumer] }),
            provide(ALIAS, { useExisting: ALPHA }),
          ],
        }),
      ),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      cause: {
        code: 'NEXUS_NOT_READY',
        owner: 'Consumer',
        target: 'Alias',
        provider: 'Alpha',
        path: [],
        contributor: null,
      },
    });
    const cause = (
      error as { cause: Parameters<typeof coreText.NEXUS_NOT_READY>[0] }
    ).cause;
    expect(coreText.NEXUS_NOT_READY(cause).message).toMatch(
      /^Consumer called its lazy\(Alias\) thunk before Alpha, which Alias aliases, was ready\./,
    );
  });

  it('names the alias token and the provider it reaches when a scoped target is not settled', async () => {
    const gateBus = deferred();
    const gateHandler = deferred<IHandler>();
    interface IHandler {
      readonly name: string;
    }
    interface IBus {
      readonly ready: true;
    }
    const BUS = new Token<IBus>('Bus');
    const HANDLER = new Token<IHandler>('Handler');
    const ALIAS = new Token<IHandler>('HandlerAlias');
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(BUS, {
            useFactory: async (handler): Promise<IBus> => {
              await gateBus.promise;
              handler();
              return { ready: true };
            },
            deps: [lazy(ALIAS)],
            lifetime: 'scoped',
          }),
          provide(HANDLER, {
            useFactory: () => gateHandler.promise,
            deps: [],
            lifetime: 'scoped',
          }),
          provide(ALIAS, { useExisting: HANDLER }),
        ],
      }),
    );
    const creating = ship.createScope();
    gateBus.resolve();
    await flush();
    gateHandler.resolve({ name: 'late' });
    expect(await rejected(creating)).toMatchObject({
      cause: {
        code: 'NEXUS_NOT_READY',
        owner: 'Bus',
        target: 'HandlerAlias',
        provider: 'Handler',
      },
    });
  });

  it('names the token the thunk was given across a two-hop alias chain', async () => {
    interface IAlpha {
      readonly n: number;
    }
    const ALPHA = new Token<IAlpha>('Alpha');
    const A1 = new Token<IAlpha>('A1');
    const A2 = new Token<IAlpha>('A2');
    class Consumer {
      constructor(alias: () => IAlpha) {
        alias();
      }
    }
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Test',
          providers: [
            provide(Consumer, { deps: [lazy(A2)] }),
            provide(ALPHA, { useFactory: () => ({ n: 1 }), deps: [Consumer] }),
            provide(A1, { useExisting: ALPHA }),
            provide(A2, { useExisting: A1 }),
          ],
        }),
      ),
    );
    expect(error).toMatchObject({
      cause: { code: 'NEXUS_NOT_READY', target: 'A2', provider: 'Alpha' },
    });
  });

  it('returns a ready target to a thunk called in an async continuation', async () => {
    const CALLSIGN = new Token<string>('Callsign');
    const GREETING = new Token<string>('Greeting');
    const Root = defineModule({
      name: 'Root',
      providers: [
        provide(CALLSIGN, { useValue: 'Meridian' }),
        provide(GREETING, {
          useFactory: async (callsign) => {
            await Promise.resolve();
            return `hail ${callsign()}`;
          },
          deps: [lazy(CALLSIGN)],
        }),
      ],
    });
    const ship = await Nexus.create(Root);
    expect(ship.get(GREETING)).toBe('hail Meridian');
  });

  it('builds a new transient on every thunk call', async () => {
    class Drone {}
    class Bay {
      constructor(readonly launch: () => Drone) {}
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(Drone, { lifetime: 'transient' }),
          provide(Bay, { deps: [lazy(Drone)] }),
        ],
      }),
    );
    const bay = ship.get(Bay);
    expect(bay.launch()).not.toBe(bay.launch());
  });

  it('reports the runtime cycle when a thunk reaches a target under construction', async () => {
    class Echo {
      constructor(self: () => Echo) {
        self();
      }
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(Echo, { deps: [lazy(Echo)], lifetime: 'transient' }),
        ],
      }),
    );
    expect(thrown(() => ship.get(Echo))).toMatchObject({
      code: 'NEXUS_NOT_READY',
      owner: 'Echo',
      target: 'Echo',
      path: ['Echo', 'Echo'],
    });
  });

  it('follows a long alias chain to its target without overflowing the call stack', async () => {
    const CHAIN_LENGTH = 20000;
    const chain = Array.from(
      { length: CHAIN_LENGTH + 1 },
      (_, i) => new Token<string>(`Link${i}`),
    );
    const providers = chain
      .slice(0, CHAIN_LENGTH)
      .map((token, i) => provide(token, { useExisting: chain[i + 1] }));
    const end = provide(chain[CHAIN_LENGTH], { useValue: 'end' });
    class Reader {
      constructor(readonly link: () => string) {}
    }
    const Root = defineModule({
      name: 'Root',
      providers: [
        ...providers,
        end,
        provide(Reader, { deps: [lazy(chain[0])] }),
      ],
    });
    const ship = await Nexus.create(Root);
    expect(ship.get(Reader).link()).toBe('end');
  });
});

describe('lazy(all())', () => {
  interface IHandler {
    readonly name: string;
  }
  interface IBus {
    handlers(): readonly IHandler[];
  }
  const HANDLERS = new MultiToken<IHandler>('Handlers');
  const BUS = new Token<IBus>('Bus');
  const handler = (name: string, built?: string[]) =>
    provide(HANDLERS, {
      useFactory: (_bus: IBus): IHandler => {
        built?.push(name);
        return { name };
      },
      deps: [BUS],
    });

  it('fails a cycle through all() with NEXUS_CIRCULAR_DEPENDENCY', async () => {
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(BUS, {
              useFactory: (handlers): IBus => ({ handlers: () => handlers }),
              deps: [all(HANDLERS)],
            }),
            handler('a'),
          ],
        }),
      ),
    );
    expect(error).toMatchObject({
      errors: [
        {
          code: 'NEXUS_CIRCULAR_DEPENDENCY',
          path: ['Bus', 'Handlers', 'Bus'],
          kinds: ['all', 'required'],
        },
      ],
    });
  });

  it('builds the same cycle through lazy(all()) and returns the contributions in record order, as a new array per call', async () => {
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(BUS, {
            useFactory: (handlers): IBus => ({ handlers }),
            deps: [lazy(all(HANDLERS))],
          }),
          handler('a'),
          handler('b'),
        ],
      }),
    );
    const bus = ship.get(BUS);
    const first = bus.handlers();
    expect(first.map((h) => h.name)).toEqual(['a', 'b']);
    expect(bus.handlers()).not.toBe(first);
    expect(bus.handlers()).toEqual(first);
    expect(bus.handlers()[0]).toBe(ship.get(HANDLERS)[0]);
  });

  it('builds a transient contribution on every call', async () => {
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(BUS, {
            useFactory: (handlers): IBus => ({ handlers }),
            deps: [lazy(all(HANDLERS))],
          }),
          provide(HANDLERS, {
            useFactory: (): IHandler => ({ name: 'fresh' }),
            deps: [],
            lifetime: 'transient',
          }),
          handler('kept'),
        ],
      }),
    );
    const bus = ship.get(BUS);
    const [a, b] = [bus.handlers(), bus.handlers()];
    expect(a[0]).not.toBe(b[0]);
    expect(a[1]).toBe(b[1]);
  });

  it('throws NEXUS_NOT_READY from a constructor, naming the first unready contribution and building none', async () => {
    const built: string[] = [];
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(HANDLERS, {
              useFactory: (): IHandler => {
                built.push('early');
                return { name: 'early' };
              },
              deps: [],
              lifetime: 'transient',
            }),
            provide(BUS, {
              useFactory: (handlers): IBus => {
                handlers();
                return { handlers };
              },
              deps: [lazy(all(HANDLERS))],
            }),
            handler('late', built),
          ],
        }),
      ),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      token: 'Bus',
      cause: { code: 'NEXUS_NOT_READY', owner: 'Bus', target: 'Handlers' },
    });
    expect(built).toEqual([]);
  });

  describe('contributor', () => {
    class Alpha implements IHandler {
      readonly name = 'alpha';
      constructor(readonly bus: IBus) {}
    }
    class Beta implements IHandler {
      readonly name = 'beta';
      constructor(readonly bus: IBus) {}
    }
    const contributing = (name: string, providers: ProviderEntry[]) =>
      defineModule({ name, providers, exports: [HANDLERS] });
    const bridge = (imports: ModuleRef[]) =>
      defineModule({
        name: 'Bridge',
        global: true,
        imports,
        providers: [
          provide(BUS, {
            useFactory: (handlers): IBus => {
              handlers();
              return { handlers };
            },
            deps: [lazy(all(HANDLERS))],
          }),
        ],
        exports: [BUS],
      });

    it('names the first unready class contribution and its module, with target unchanged', async () => {
      const error = await rejected(
        Nexus.create(
          bridge([
            contributing('Hangar', [
              provide(HANDLERS, { useClass: Alpha, deps: [BUS] }),
            ]),
            contributing('Dock', [
              provide(HANDLERS, { useClass: Beta, deps: [BUS] }),
            ]),
          ]),
        ),
      );
      const cause = (error as { cause: Error & Record<string, unknown> }).cause;
      expect(cause).toMatchObject({
        code: 'NEXUS_NOT_READY',
        owner: 'Bus',
        target: 'Handlers',
        contributor: 'Alpha (module Hangar)',
      });
      expect(cause.message).toContain('contributor=Alpha (module Hangar)');
    });

    it('names the second contribution when the first listed one is ready', async () => {
      const error = await rejected(
        Nexus.create(
          bridge([
            contributing('Hangar', [
              provide(HANDLERS, { useValue: { name: 'ready' } }),
            ]),
            contributing('Dock', [
              provide(HANDLERS, { useClass: Beta, deps: [BUS] }),
            ]),
          ]),
        ),
      );
      expect(error).toMatchObject({
        cause: {
          code: 'NEXUS_NOT_READY',
          target: 'Handlers',
          provider: null,
          contributor: 'Beta (module Dock)',
        },
      });
    });

    it('names the alias record when the contribution is a useExisting of an unready provider', async () => {
      const error = await rejected(
        Nexus.create(
          bridge([
            contributing('Hangar', [
              provide(Alpha, { deps: [BUS] }),
              provide(HANDLERS, { useExisting: Alpha }),
            ]),
          ]),
        ),
      );
      expect(error).toMatchObject({
        cause: {
          code: 'NEXUS_NOT_READY',
          owner: 'Bus',
          target: 'Handlers',
          provider: null,
          contributor: 'useExisting #1 (module Hangar)',
        },
      });
    });

    it('keeps target on the multi token and ends the path on the refused provider when an alias contribution closes a runtime cycle', async () => {
      class Looper implements IHandler {
        readonly name = 'looper';
        constructor(handlers: () => readonly IHandler[]) {
          handlers();
        }
      }
      const error = await rejected(
        Nexus.create(
          defineModule({
            name: 'Hangar',
            providers: [
              provide(Looper, { deps: [lazy(all(HANDLERS))] }),
              provide(HANDLERS, { useExisting: Looper }),
            ],
          }),
        ),
      );
      const cause = (error as { cause: Error & Record<string, unknown> }).cause;
      expect(cause).toMatchObject({
        code: 'NEXUS_NOT_READY',
        owner: 'Looper',
        target: 'Handlers',
        contributor: 'useExisting #1 (module Hangar)',
      });
      expect((cause.path as string[]).at(-1)).toBe('Looper');
    });

    it('names a contribution without a class by its form and position', async () => {
      const error = await rejected(
        Nexus.create(
          bridge([
            contributing('Hangar', [
              provide(HANDLERS, {
                useFactory: (_bus: IBus) => ({ name: 'a' }),
                deps: [BUS],
              }),
            ]),
          ]),
        ),
      );
      expect(error).toMatchObject({
        cause: {
          code: 'NEXUS_NOT_READY',
          target: 'Handlers',
          contributor: 'useFactory #1 (module Hangar)',
        },
      });
    });

    it('leaves contributor null for a plain lazy() thunk and keeps its message', async () => {
      class EagerRouter {
        constructor(shields: () => ShieldGrid) {
          shields();
        }
      }
      const error = await rejected(
        Nexus.create(
          defineModule({
            name: 'Engineering',
            providers: [
              provide(EagerRouter, { deps: [lazy(ShieldGrid)] }),
              provide(ShieldGrid, { deps: [EagerRouter as never] }),
            ],
          }),
        ),
      );
      const cause = (error as { cause: Error & Record<string, unknown> }).cause;
      expect(cause).toMatchObject({
        code: 'NEXUS_NOT_READY',
        contributor: null,
      });
      expect(cause.message).toBe(
        '[NEXUS_NOT_READY] owner=EagerRouter target=ShieldGrid. https://nexus.js.org/errors/NEXUS_NOT_READY',
      );
    });
  });

  it('meets NEXUS_DISPOSED in a collector disposer that calls the thunk, since the contributions go first', async () => {
    let met: unknown;
    class Bus implements IBus {
      static deps = [lazy(all(HANDLERS))] as const;
      constructor(readonly handlers: () => readonly IHandler[]) {}
      [Symbol.asyncDispose](): Promise<void> {
        try {
          this.handlers();
        } catch (error) {
          met = error;
        }
        return Promise.resolve();
      }
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(BUS, { useClass: Bus }),
          provide(HANDLERS, {
            useFactory: (_bus: IBus) => ({
              name: 'a',
              [Symbol.dispose]() {},
            }),
            deps: [BUS],
          }),
        ],
      }),
    );
    expect(ship.get(BUS).handlers()).toHaveLength(1);
    await ship[Symbol.asyncDispose]();
    expect(met).toMatchObject({ code: 'NEXUS_DISPOSED' });
  });

  it('throws NEXUS_NOT_READY when a collector calls the thunk while an async singleton contribution is pending, and builds none', async () => {
    const built: string[] = [];
    const gateBus = deferred();
    const gateHandler = deferred<IHandler>();
    const creating = Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(BUS, {
            useFactory: async (handlers): Promise<IBus> => {
              await gateBus.promise;
              handlers();
              return { handlers };
            },
            deps: [lazy(all(HANDLERS))],
          }),
          provide(HANDLERS, {
            useFactory: (): IHandler => {
              built.push('transient');
              return { name: 'transient' };
            },
            deps: [],
            lifetime: 'transient',
          }),
          provide(HANDLERS, {
            useFactory: () => gateHandler.promise,
            deps: [],
          }),
        ],
      }),
    );
    gateBus.resolve();
    await flush();
    gateHandler.resolve({ name: 'late' });
    expect(await rejected(creating)).toMatchObject({
      token: 'Bus',
      cause: { code: 'NEXUS_NOT_READY', owner: 'Bus', target: 'Handlers' },
    });
    expect(built).toEqual([]);
  });

  it('throws NEXUS_LAZY_ASYNC for an eager: false async contribution, after building the transient contribution before it', async () => {
    const built: string[] = [];
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(BUS, {
            useFactory: (handlers): IBus => ({ handlers }),
            deps: [lazy(all(HANDLERS))],
          }),
          provide(HANDLERS, {
            useFactory: (): IHandler => {
              built.push('transient');
              return { name: 'transient' };
            },
            deps: [],
            lifetime: 'transient',
          }),
          provide(HANDLERS, {
            useFactory: async (): Promise<IHandler> => ({ name: 'async' }),
            deps: [],
            eager: false,
          } as never),
        ],
      }),
    );
    expect(thrown(() => ship.get(BUS).handlers())).toMatchObject({
      code: 'NEXUS_LAZY_ASYNC',
      token: 'Handlers',
    });
    expect(built).toEqual(['transient']);
  });

  it('throws NEXUS_NOT_READY for an unsettled scoped async contribution', async () => {
    const gateBus = deferred();
    const gateHandler = deferred<IHandler>();
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(BUS, {
            useFactory: async (handlers): Promise<IBus> => {
              await gateBus.promise;
              handlers();
              return { handlers };
            },
            deps: [lazy(all(HANDLERS))],
            lifetime: 'scoped',
          }),
          provide(HANDLERS, {
            useFactory: () => gateHandler.promise,
            deps: [],
            lifetime: 'scoped',
          }),
        ],
      }),
    );
    const creating = ship.createScope();
    gateBus.resolve();
    await flush();
    gateHandler.resolve({ name: 'late' });
    expect(await rejected(creating)).toMatchObject({
      cause: {
        code: 'NEXUS_NOT_READY',
        owner: 'Bus',
        target: 'Handlers',
        contributor: 'useFactory #1 (module Root)',
      },
    });
  });
});

describe('makeListThunk', () => {
  class Disposed {}
  class Pending {}
  const setup = () => {
    const bp = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          provide(Disposed, { deps: [] }),
          provide(Pending, { deps: [] }),
        ],
      }),
    });
    const root = rootState({
      blueprint: bp,
      rootRef: {},
      tracer: new Tracer(),
      initEnabled: true,
    });
    const idOf = (name: string) => {
      const record = [...bp.providers.values()].find((r) => r.name === name);
      if (record === undefined) throw new Error(`internal: no ${name}`);
      return record.id;
    };
    const disposed = idOf('Disposed');
    const instance = {};
    root.slots.settle(disposed, instance);
    root.slots.markReady(disposed);
    root.ownership.markDisposed(instance);
    const pending = idOf('Pending');
    root.slots.begin(pending, new Promise(() => undefined));
    const thunk = (ids: string[]) =>
      makeListThunk(
        ids,
        { id: null, name: 'Bus', lifetime: 'singleton' },
        { bp, container: root, owner: root },
        () => {
          throw new Error('internal: nothing may build');
        },
      );
    return { thunk, disposed, pending };
  };

  it('throws the first refusal in record order: NEXUS_DISPOSED before an unready id', () => {
    const { thunk, disposed, pending } = setup();
    expect(thrown(thunk([disposed, pending]))).toMatchObject({
      code: 'NEXUS_DISPOSED',
    });
  });

  it('throws the first refusal in record order: NEXUS_NOT_READY before a disposed id', () => {
    const { thunk, disposed, pending } = setup();
    expect(thrown(thunk([pending, disposed]))).toMatchObject({
      code: 'NEXUS_NOT_READY',
      target: 'Pending',
    });
  });
});

describe('makeThunk', () => {
  it('resolves a singleton thunk building a transient with a singleton-thunk owner, never the container', () => {
    class Drone {}
    class Bay {}
    const bp = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          provide(Drone, { lifetime: 'transient' }),
          provide(Bay, { deps: [] }),
        ],
      }),
    });
    const root = rootState({
      blueprint: bp,
      rootRef: {},
      tracer: new Tracer(),
      initEnabled: true,
    });
    const droneRecord = [...bp.providers.values()].find(
      (record) => record.name === 'Drone',
    );
    if (droneRecord === undefined)
      throw new Error('internal: no compiled provider record for Drone');
    const bayRecord = [...bp.providers.values()].find(
      (record) => record.name === 'Bay',
    );
    if (bayRecord === undefined)
      throw new Error('internal: no compiled provider record for Bay');
    const owners: TransientOwner[] = [];
    const resolve: ResolveId = (id, ctx) => {
      owners.push(ctx.owner);
      return {};
    };
    const thunk = makeThunk(
      droneRecord.id,
      bayRecord,
      { bp, container: root, owner: root },
      resolve,
    );
    thunk();
    // adopt() in build.ts tracks a built transient for disposal only when
    // ctx.owner is a container object (spec section 6.5); a singleton's
    // thunk passes the string 'singleton-thunk' instead, so each transient
    // it builds stays untracked and never joins root.owned.
    expect(owners).toEqual(['singleton-thunk']);
  });
});
