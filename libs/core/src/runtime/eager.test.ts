import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { rejected, thrown } from '../../test-support/catch.js';
import { deferred, flush } from '../../test-support/deferred.js';
import { observer } from '../../test-support/observe.js';
import { defineModule } from '../definitions/define-module.js';
import { lazy } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import type { NexusError } from '../errors/index.js';
import { Nexus } from './nexus.js';
import type { NexusPlugin } from './plugins.js';

const log: string[] = [];
class DatabaseClient {
  constructor() {
    log.push('connect');
  }
  onInit() {
    log.push('init');
  }
  [Symbol.dispose]() {
    log.push('close');
  }
}
const Data = defineModule({
  name: 'Data',
  providers: [provide(DatabaseClient, { eager: false })],
  exports: [DatabaseClient],
});

describe('eager: false', () => {
  it('builds a singleton at its first get(), with its onInit', async () => {
    log.length = 0;
    const ship = await Nexus.create(Data);
    expect(log).toEqual([]);
    const client = ship.get(DatabaseClient);
    expect(log).toEqual(['connect', 'init']);
    expect(ship.get(DatabaseClient)).toBe(client);
    await ship[Symbol.asyncDispose]();
    expect(log).toEqual(['connect', 'init', 'close']);
  });

  it('builds a singleton first requested in a scope into the root', async () => {
    log.length = 0;
    const ship = await Nexus.create(Data);
    const shuttle = await ship.createScope();
    const fromScope = shuttle.get(DatabaseClient);
    await shuttle[Symbol.asyncDispose]();
    expect(log).toEqual(['connect', 'init']);
    expect(ship.get(DatabaseClient)).toBe(fromScope);
    await ship[Symbol.asyncDispose]();
    expect(log).toEqual(['connect', 'init', 'close']);
  });

  it('is built at create when an eager provider needs it', async () => {
    log.length = 0;
    class Repository {
      static deps = [DatabaseClient] as const;
      constructor(readonly client: DatabaseClient) {}
      onInit() {
        log.push('repository init');
      }
    }
    const ship = await Nexus.create(
      defineModule({ name: 'App', imports: [Data], providers: [Repository] }),
    );
    expect(log).toEqual(['connect', 'init', 'repository init']);
    await ship[Symbol.asyncDispose]();
    expect(log).toEqual(['connect', 'init', 'repository init', 'close']);
  });

  it('defers a scoped factory until the scope asks for it', async () => {
    let opened = 0;
    const TX = new Token<number>('Transaction');
    const ship = await Nexus.create(
      defineModule({
        name: 'App',
        providers: [
          provide(TX, {
            useFactory: () => ++opened,
            lifetime: 'scoped',
            eager: false,
          }),
        ],
        exports: [TX],
      }),
    );
    const health = await ship.createScope();
    expect(opened).toBe(0);
    const request = await ship.createScope();
    expect(request.get(TX)).toBe(1);
    expect(request.get(TX)).toBe(1);
    await Promise.all([health, request].map((s) => s[Symbol.asyncDispose]()));
  });

  it('builds on a lazy thunk call', async () => {
    const CLIENT = new Token<DatabaseClient>('Client');
    class Service {
      static deps = [lazy(CLIENT)] as const;
      constructor(readonly client: () => DatabaseClient) {}
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'App',
        providers: [
          provide(CLIENT, { useClass: DatabaseClient, eager: false }),
          Service,
        ],
        exports: [Service, CLIENT],
      }),
    );
    expect(ship.get(Service).client()).toBe(ship.get(CLIENT));
  });

  it('throws NEXUS_LAZY_ASYNC for a thenable, and tries again next time', async () => {
    let calls = 0;
    const CHARTS = new Token<string>('Charts');
    const ship = await Nexus.create(
      defineModule({
        name: 'App',
        providers: [
          provide(CHARTS, {
            useFactory: (() =>
              ++calls === 1 ? Promise.resolve('x') : 'y') as never,
            eager: false,
          } as never),
        ],
        exports: [CHARTS],
      }),
    );
    expect(thrown(() => ship.get(CHARTS))).toMatchObject({
      code: 'NEXUS_LAZY_ASYNC',
      token: 'Charts',
    });
    expect(ship.get(CHARTS)).toBe('y');
  });

  it('rejects eager on a transient and a non-boolean eager', async () => {
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'App',
          providers: [
            {
              token: DatabaseClient,
              lifetime: 'transient',
              eager: false,
            } as never,
            { token: class Probe {}, eager: 'no' } as never,
          ],
        }),
      ),
    );
    expect(error).toMatchObject({
      errors: [
        { code: 'NEXUS_INVALID_PROVIDER', reason: 'eager-not-deferrable' },
        { code: 'NEXUS_INVALID_PROVIDER', reason: 'bad-eager' },
      ],
    });
  });
});

interface IReactor {
  readonly output: number;
}
const REACTOR = new Token<IReactor>('Reactor');

/** A reactor class that logs its lifecycle under `name`. */
function reactor(name: string, events: string[]) {
  return class implements IReactor {
    readonly output = 1.21;
    constructor(..._deps: unknown[]) {
      events.push(`${name} built`);
    }
    [Symbol.dispose]() {
      events.push(`${name} disposed`);
    }
  };
}

describe('eager: false builds', () => {
  const unhandled: unknown[] = [];
  const record = (reason: unknown) => unhandled.push(reason);
  beforeEach(() => {
    unhandled.length = 0;
    process.on('unhandledRejection', record);
  });
  afterEach(() => {
    process.off('unhandledRejection', record);
  });

  it('throws NEXUS_LAZY_ASYNC for an async onInit, leaves no unhandled rejection, and tries again next time', async () => {
    let calls = 0;
    const events: string[] = [];
    class Reactor implements IReactor {
      readonly output = 1.21;
      onInit(): unknown {
        return ++calls === 1 ? Promise.reject(new Error('late')) : undefined;
      }
      [Symbol.dispose]() {
        events.push('disposed');
      }
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'Engineering',
        providers: [
          provide(REACTOR, { useClass: Reactor, eager: false } as never),
        ],
        exports: [REACTOR],
      }),
    );
    expect(thrown(() => ship.get(REACTOR))).toMatchObject({
      code: 'NEXUS_LAZY_ASYNC',
      token: 'Reactor',
      module: 'Engineering',
    });
    await flush();
    expect(unhandled).toEqual([]);
    const second = ship.get(REACTOR);
    expect(ship.get(REACTOR)).toBe(second);
    await ship[Symbol.asyncDispose]();
    // The instance whose onInit returned a promise joined the creation order
    // at its build, so root disposal disposes it too.
    expect(events).toEqual(['disposed', 'disposed']);
  });

  it('leaves no unhandled rejection when a factory rejects', async () => {
    const CHARTS = new Token<string>('Charts');
    const ship = await Nexus.create(
      defineModule({
        name: 'App',
        providers: [
          provide(CHARTS, {
            useFactory: () => Promise.reject(new Error('late')),
            eager: false,
          } as never),
        ],
        exports: [CHARTS],
      }),
    );
    expect(thrown(() => ship.get(CHARTS))).toMatchObject({
      code: 'NEXUS_LAZY_ASYNC',
    });
    await flush();
    expect(unhandled).toEqual([]);
  });

  it('builds through resolve()', async () => {
    const events: string[] = [];
    const ship = await Nexus.create(
      defineModule({
        name: 'Engineering',
        providers: [
          provide(REACTOR, {
            useClass: reactor('Reactor', events),
            eager: false,
          }),
        ],
        exports: [REACTOR],
      }),
    );
    expect(events).toEqual([]);
    const { core } = ship.resolve({ core: REACTOR });
    expect(events).toEqual(['Reactor built']);
    expect(ship.get(REACTOR)).toBe(core);
  });

  it('builds a scoped factory an eager scoped factory depends on during createScope', async () => {
    const opened: string[] = [];
    const TX = new Token<string>('Transaction');
    const AUDIT = new Token<string>('Audit');
    const ship = await Nexus.create(
      defineModule({
        name: 'App',
        providers: [
          provide(TX, {
            useFactory: () => {
              opened.push('tx');
              return 'tx';
            },
            lifetime: 'scoped',
            eager: false,
          }),
          provide(AUDIT, {
            useFactory: (tx) => {
              opened.push('audit');
              return `audit:${tx}`;
            },
            deps: [TX],
            lifetime: 'scoped',
          }),
        ],
        exports: [TX, AUDIT],
      }),
    );
    const shuttle = await ship.createScope();
    expect(opened).toEqual(['tx', 'audit']);
    expect(shuttle.get(AUDIT)).toBe('audit:tx');
  });

  it('disposes a late-built singleton in reverse creation order', async () => {
    const events: string[] = [];
    const SHIELDS = new Token<IReactor>('Shields');
    const ship = await Nexus.create(
      defineModule({
        name: 'Engineering',
        providers: [
          provide(REACTOR, {
            useClass: reactor('Reactor', events),
            eager: false,
          }),
          provide(SHIELDS, { useClass: reactor('Shields', events) }),
        ],
        exports: [REACTOR, SHIELDS],
      }),
    );
    ship.get(REACTOR);
    await ship[Symbol.asyncDispose]();
    expect(events).toEqual([
      'Shields built',
      'Reactor built',
      'Reactor disposed',
      'Shields disposed',
    ]);
  });

  it('throws the ProviderError of a failed build, stores nothing, and tries again next time', async () => {
    let calls = 0;
    class Reactor implements IReactor {
      readonly output = 1.21;
      constructor() {
        if (++calls === 1) throw new Error('coolant leak');
      }
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'Engineering',
        providers: [provide(REACTOR, { useClass: Reactor, eager: false })],
        exports: [REACTOR],
      }),
    );
    expect(thrown(() => ship.get(REACTOR))).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      token: 'Reactor',
      module: 'Engineering',
      cause: expect.objectContaining({ message: 'coolant leak' }) as unknown,
    });
    expect(ship.get(REACTOR)).toBeInstanceOf(Reactor);
  });

  it('throws the ProviderError of a failed onInit and keeps the instance for disposal', async () => {
    let calls = 0;
    const events: string[] = [];
    class Reactor implements IReactor {
      readonly output = 1.21;
      onInit() {
        if (++calls === 1) throw new Error('ignition failed');
      }
      [Symbol.dispose]() {
        events.push('disposed');
      }
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'Engineering',
        providers: [provide(REACTOR, { useClass: Reactor, eager: false })],
        exports: [REACTOR],
      }),
    );
    expect(thrown(() => ship.get(REACTOR))).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      token: 'Reactor',
      cause: expect.objectContaining({
        message: 'ignition failed',
      }) as unknown,
    });
    const reactorInstance = ship.get(REACTOR);
    expect(ship.get(REACTOR)).toBe(reactorInstance);
    await ship[Symbol.asyncDispose]();
    expect(events).toEqual(['disposed', 'disposed']);
  });

  it('keeps the text of a NexusError its factory or onInit threw', async () => {
    const other = await Nexus.create(defineModule({ name: 'Bravo' }));
    const foreign = thrown(() => other.get(REACTOR)) as NexusError;
    const message = foreign.message;
    const formatter: NexusPlugin = {
      name: 'formatter',
      apiVersion: 1,
      formatError: () => ({ message: 'rewritten' }),
    };
    const CHARTS = new Token<string>('Charts');
    class Reactor implements IReactor {
      readonly output = 1.21;
      onInit() {
        throw foreign;
      }
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'Engineering',
        providers: [
          provide(CHARTS, {
            useFactory: (): string => {
              throw foreign;
            },
            eager: false,
          }),
          provide(REACTOR, { useClass: Reactor, eager: false }),
        ],
        exports: [CHARTS, REACTOR],
      }),
      { plugins: [formatter] },
    );
    expect(thrown(() => ship.get(CHARTS))).toBe(foreign);
    expect(thrown(() => ship.get(REACTOR))).toBe(foreign);
    expect(foreign.message).toBe(message);
  });

  it('reports NEXUS_NOT_READY with its path for a runtime cycle through a lazy thunk', async () => {
    const PILOT = new Token<IReactor>('Pilot');
    class Pilot implements IReactor {
      readonly output: number;
      static deps = [lazy(PILOT)] as const;
      constructor(self: () => IReactor) {
        this.output = self().output;
      }
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'Bridge',
        providers: [provide(PILOT, { useClass: Pilot, eager: false })],
        exports: [PILOT],
      }),
    );
    expect(thrown(() => ship.get(PILOT))).toMatchObject({
      code: 'NEXUS_NOT_READY',
      owner: 'Pilot',
      target: 'Pilot',
      path: ['Pilot', 'Pilot'],
    });
  });

  it('sends a construct event with the build', async () => {
    const events: string[] = [];
    const ship = await Nexus.create(
      defineModule({
        name: 'Engineering',
        providers: [
          provide(REACTOR, {
            useClass: reactor('Reactor', []),
            eager: false,
          }),
        ],
        exports: [REACTOR],
      }),
      {
        plugins: [
          observer((event) => {
            if (event.type === 'construct') events.push(event.token);
          }),
        ],
      },
    );
    expect(events).toEqual([]);
    ship.get(REACTOR);
    expect(events).toEqual(['Reactor']);
  });

  it('adopts the raw instance when a construct hook fails and disposes it once', async () => {
    const events: string[] = [];
    let fail = true;
    const saboteur: NexusPlugin = {
      name: 'saboteur',
      apiVersion: 1,
      construct: (_, provider) => {
        if (provider.token === REACTOR && fail) {
          fail = false;
          throw new Error('sabotaged');
        }
        return undefined;
      },
    };
    const ship = await Nexus.create(
      defineModule({
        name: 'Engineering',
        providers: [
          provide(REACTOR, {
            useClass: reactor('Reactor', events),
            eager: false,
          }),
        ],
        exports: [REACTOR],
      }),
      { plugins: [saboteur] },
    );
    expect(thrown(() => ship.get(REACTOR))).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      cause: { code: 'NEXUS_PLUGIN_FAILED', plugin: 'saboteur' },
    });
    ship.get(REACTOR);
    await ship[Symbol.asyncDispose]();
    expect(events).toEqual([
      'Reactor built',
      'Reactor built',
      'Reactor disposed',
      'Reactor disposed',
    ]);
  });

  it('disposes an eager: false singleton a failed load built for an eager provider', async () => {
    const events: string[] = [];
    const SHIELDS = new Token<IReactor>('Shields');
    const ship = await Nexus.create(defineModule({ name: 'Bridge' }));
    const error = await rejected(
      ship.load(
        defineModule({
          name: 'Engineering',
          providers: [
            provide(REACTOR, {
              useClass: reactor('Reactor', events),
              eager: false,
            }),
            provide(SHIELDS, {
              useFactory: (): IReactor => {
                throw new Error('overload');
              },
              deps: [REACTOR],
            }),
          ],
        }),
      ),
    );
    expect(error).toMatchObject({ code: 'NEXUS_PROVIDER_FAILED' });
    expect(events).toEqual(['Reactor built', 'Reactor disposed']);
    await ship[Symbol.asyncDispose]();
    expect(events).toEqual(['Reactor built', 'Reactor disposed']);
  });

  it('keeps a singleton of an earlier blueprint that a failed load built on first use', async () => {
    const events: string[] = [];
    const SHIELDS = new Token<IReactor>('Shields');
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [
        provide(REACTOR, {
          useClass: reactor('Reactor', events),
          eager: false,
        }),
      ],
      exports: [REACTOR],
      global: true,
    });
    const ship = await Nexus.create(
      defineModule({ name: 'Bridge', imports: [Engineering] }),
    );
    await rejected(
      ship.load(
        defineModule({
          name: 'Tactical',
          providers: [
            provide(SHIELDS, {
              useFactory: (): IReactor => {
                throw new Error('overload');
              },
              deps: [REACTOR],
            }),
          ],
        }),
      ),
    );
    expect(events).toEqual(['Reactor built']);
    const kept = ship.get(REACTOR);
    expect(events).toEqual(['Reactor built']);
    await ship[Symbol.asyncDispose]();
    expect(events).toEqual(['Reactor built', 'Reactor disposed']);
    expect(kept.output).toBe(1.21);
  });

  it('keeps a singleton a get() built while a failed load ran', async () => {
    const events: string[] = [];
    const gate = deferred<IReactor>();
    const SHIELDS = new Token<IReactor>('Shields');
    const SENSORS = new Token<IReactor>('Sensors');
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [
        provide(REACTOR, {
          useClass: reactor('Reactor', events),
          eager: false,
        }),
      ],
      exports: [REACTOR],
      global: true,
    });
    const ship = await Nexus.create(
      defineModule({ name: 'Bridge', imports: [Engineering] }),
    );
    const loading = ship.load(
      defineModule({
        name: 'Tactical',
        providers: [
          provide(SENSORS, { useFactory: () => gate.promise }),
          provide(SHIELDS, {
            useFactory: (): IReactor => {
              throw new Error('overload');
            },
            deps: [SENSORS, REACTOR],
          }),
        ],
      }),
    );
    await flush();
    const kept = ship.get(REACTOR);
    gate.resolve({ output: 0 });
    await rejected(loading);
    expect(ship.get(REACTOR)).toBe(kept);
    expect(events).toEqual(['Reactor built']);
  });
});

describe('compile.provider with eager: false', () => {
  it('builds a replacement that keeps a transient lifetime at every request', async () => {
    const events: string[] = [];
    const views: boolean[] = [];
    const Replacement = reactor('Replacement', events);
    const ship = await Nexus.create(
      defineModule({
        name: 'Engineering',
        providers: [
          provide(REACTOR, {
            useClass: reactor('Reactor', events),
            lifetime: 'transient',
          }),
        ],
        exports: [REACTOR],
      }),
      {
        plugins: [
          {
            name: 'swap',
            apiVersion: 1,
            compile: {
              provider: (view) =>
                view.token === REACTOR
                  ? {
                      with: provide(REACTOR, {
                        useClass: Replacement,
                        eager: false,
                      }),
                    }
                  : undefined,
              check: (view) => {
                for (const p of view.providers)
                  if (p.token === REACTOR) views.push(p.eager);
              },
            },
          },
        ],
      },
    );
    expect(views).toEqual([true]);
    expect(ship.get(REACTOR)).not.toBe(ship.get(REACTOR));
    expect(events).toEqual(['Replacement built', 'Replacement built']);
  });
  it('keeps eager: false when a replacement sets no eager', async () => {
    const events: string[] = [];
    const ship = await Nexus.create(
      defineModule({
        name: 'Engineering',
        providers: [
          provide(REACTOR, {
            useClass: reactor('Reactor', events),
            eager: false,
          }),
        ],
        exports: [REACTOR],
      }),
      {
        plugins: [
          {
            name: 'swap',
            apiVersion: 1,
            compile: {
              provider: (view) =>
                view.token === REACTOR
                  ? {
                      with: provide(REACTOR, {
                        useClass: reactor('Replacement', events),
                      }),
                    }
                  : undefined,
            },
          },
        ],
      },
    );
    expect(events).toEqual([]);
    ship.get(REACTOR);
    expect(events).toEqual(['Replacement built']);
  });
});

describe('Scope.extend with eager: false', () => {
  it('skips a scoped factory load() added, which then builds on first get() into the scope', async () => {
    const events: string[] = [];
    const TX = new Token<{ readonly id: string }>('Transaction');
    const EARLY = new Token<IReactor>('Early');
    const ship = await Nexus.create(
      defineModule({
        name: 'Bridge',
        providers: [
          provide(EARLY, {
            useFactory: () => {
              events.push('early built');
              return {
                output: 1,
                [Symbol.dispose]: () => void events.push('early disposed'),
              };
            },
            lifetime: 'scoped',
          }),
        ],
      }),
    );
    const shuttle = await ship.createScope();
    await ship.load(
      defineModule({
        name: 'Tactical',
        providers: [
          provide(TX, {
            useFactory: () => {
              events.push('tx built');
              return {
                id: 'tx',
                [Symbol.dispose]: () => void events.push('tx disposed'),
              };
            },
            lifetime: 'scoped',
            eager: false,
          }),
        ],
        exports: [TX],
      }),
    );
    await shuttle.extend();
    expect(events).toEqual(['early built']);
    const tx = shuttle.get(TX);
    expect(shuttle.get(TX)).toBe(tx);
    expect(events).toEqual(['early built', 'tx built']);
    await shuttle[Symbol.asyncDispose]();
    expect(events).toEqual([
      'early built',
      'tx built',
      'tx disposed',
      'early disposed',
    ]);
    await ship[Symbol.asyncDispose]();
    expect(events).toHaveLength(4);
  });

  it('disposes an eager: false scoped factory a failed extend() built, and builds a new one on retry', async () => {
    const events: string[] = [];
    let attempt = 0;
    const ZONE = new Token<IReactor>('Zone');
    const FIELD = new Token<IReactor>('Field');
    const GRID = new Token<IReactor>('Grid');
    const ship = await Nexus.create(defineModule({ name: 'Bridge' }));
    const shuttle = await ship.createScope();
    await ship.load(
      defineModule({
        name: 'Tactical',
        providers: [
          provide(ZONE, {
            useFactory: () => {
              const n = ++attempt;
              events.push(`zone built ${n}`);
              return {
                output: n,
                [Symbol.dispose]: () => void events.push(`zone disposed ${n}`),
              };
            },
            lifetime: 'scoped',
            eager: false,
          }),
          provide(FIELD, {
            useFactory: (zone) => zone,
            deps: [ZONE],
            lifetime: 'scoped',
          }),
          provide(GRID, {
            useFactory: (field) =>
              attempt === 1
                ? Promise.reject(new Error('overload'))
                : Promise.resolve(field),
            deps: [FIELD],
            lifetime: 'scoped',
          }),
        ],
        exports: [FIELD],
      }),
    );
    expect(await rejected(shuttle.extend())).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
    });
    expect(events).toEqual(['zone built 1', 'zone disposed 1']);
    await shuttle.extend();
    expect(shuttle.get(FIELD).output).toBe(2);
    await shuttle[Symbol.asyncDispose]();
    expect(events).toEqual([
      'zone built 1',
      'zone disposed 1',
      'zone built 2',
      'zone disposed 2',
    ]);
  });

  it('disposes an eager: false scoped factory a lazy thunk built during a failed extend()', async () => {
    const events: string[] = [];
    const ZONE = new Token<IReactor>('Zone');
    const FIELD = new Token<IReactor>('Field');
    const GRID = new Token<IReactor>('Grid');
    const ship = await Nexus.create(defineModule({ name: 'Bridge' }));
    const shuttle = await ship.createScope();
    await ship.load(
      defineModule({
        name: 'Tactical',
        providers: [
          provide(ZONE, {
            useFactory: () => {
              events.push('zone built');
              return {
                output: 1,
                [Symbol.dispose]: () => void events.push('zone disposed'),
              };
            },
            lifetime: 'scoped',
            eager: false,
          }),
          provide(FIELD, {
            useFactory: (zone) => zone(),
            deps: [lazy(ZONE)],
            lifetime: 'scoped',
          }),
          provide(GRID, {
            useFactory: (): Promise<IReactor> =>
              Promise.reject(new Error('overload')),
            deps: [FIELD],
            lifetime: 'scoped',
          }),
        ],
      }),
    );
    await rejected(shuttle.extend());
    expect(events).toEqual(['zone built', 'zone disposed']);
    await shuttle[Symbol.asyncDispose]();
    expect(events).toEqual(['zone built', 'zone disposed']);
  });
});

describe('eager: false during a failed run', () => {
  /** A module whose Bridge onInit calls its lazy Reactor thunk, and whose Shields onInit rejects. */
  function failingRun(events: string[]) {
    const BRIDGE = new Token<IReactor>('Bridge');
    const SHIELDS = new Token<IReactor>('Shields');
    class Bridge implements IReactor {
      readonly output = 1;
      static deps = [lazy(REACTOR)] as const;
      constructor(readonly reactor: () => IReactor) {}
      onInit() {
        this.reactor();
      }
    }
    class Shields implements IReactor {
      readonly output = 1;
      static deps = [BRIDGE] as const;
      constructor(readonly bridge: IReactor) {}
      onInit(): Promise<void> {
        return Promise.reject(new Error('overload'));
      }
    }
    return defineModule({
      name: 'Engineering',
      providers: [
        provide(REACTOR, {
          useClass: reactor('Reactor', events),
          eager: false,
        }),
        provide(BRIDGE, { useClass: Bridge }),
        provide(SHIELDS, { useClass: Shields }),
      ],
    });
  }

  it('disposes an eager: false singleton a lazy thunk built during a failed create', async () => {
    const events: string[] = [];
    await rejected(Nexus.create(failingRun(events)));
    expect(events).toEqual(['Reactor built', 'Reactor disposed']);
  });

  it('disposes an eager: false singleton a lazy thunk built during a failed load, once', async () => {
    const events: string[] = [];
    const ship = await Nexus.create(defineModule({ name: 'Bridge' }));
    await rejected(ship.load(failingRun(events)));
    expect(events).toEqual(['Reactor built', 'Reactor disposed']);
    await ship[Symbol.asyncDispose]();
    expect(events).toEqual(['Reactor built', 'Reactor disposed']);
  });

  it('runs the onInit of an eager: false singleton after its deps finish theirs', async () => {
    const events: string[] = [];
    const POOL = new Token<{ ready: boolean }>('Pool');
    const CLIENT = new Token<IReactor>('Client');
    const REPOSITORY = new Token<IReactor>('Repository');
    class Pool {
      ready = false;
      async onInit() {
        await Promise.resolve();
        this.ready = true;
        events.push('pool init');
      }
    }
    class Client implements IReactor {
      readonly output = 1;
      static deps = [POOL] as const;
      constructor(readonly pool: { ready: boolean }) {}
      onInit() {
        events.push(`client init, pool ready=${this.pool.ready}`);
      }
    }
    class Repository implements IReactor {
      readonly output = 1;
      static deps = [CLIENT] as const;
      constructor(readonly client: IReactor) {}
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'Data',
        providers: [
          provide(POOL, { useClass: Pool }),
          provide(CLIENT, { useClass: Client, eager: false }),
          provide(REPOSITORY, { useClass: Repository }),
        ],
      }),
    );
    expect(events).toEqual(['pool init', 'client init, pool ready=true']);
    await ship[Symbol.asyncDispose]();
  });

  it('treats a levelled eager: false singleton as eager, so a thunk that reaches it before its level is not ready', async () => {
    const events: string[] = [];
    const PILOT = new Token<IReactor>('Pilot');
    const SHIELDS = new Token<IReactor>('Shields');
    class Pilot implements IReactor {
      readonly output: number;
      static deps = [lazy(REACTOR)] as const;
      constructor(reactorOf: () => IReactor) {
        this.output = reactorOf().output;
      }
    }
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Engineering',
          providers: [
            provide(PILOT, { useClass: Pilot }),
            provide(REACTOR, {
              useClass: reactor('Reactor', events),
              eager: false,
            }),
            provide(SHIELDS, {
              useFactory: (core) => core,
              deps: [REACTOR],
            }),
          ],
        }),
      ),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      cause: { code: 'NEXUS_NOT_READY', target: 'Reactor' },
    });
    expect(events.filter((e) => e === 'Reactor built')).toHaveLength(1);
  });

  it('treats a levelled eager: false scoped factory as eager, so a thunk that reaches it before its level is not ready', async () => {
    let zones = 0;
    const ZONE = new Token<number>('Zone');
    const FIELD = new Token<number>('Field');
    const GRID = new Token<number>('Grid');
    const ship = await Nexus.create(
      defineModule({
        name: 'Tactical',
        providers: [
          provide(FIELD, {
            useFactory: (zone) => zone(),
            deps: [lazy(ZONE)],
            lifetime: 'scoped',
          }),
          provide(ZONE, {
            useFactory: () => ++zones,
            lifetime: 'scoped',
            eager: false,
          }),
          provide(GRID, {
            useFactory: (zone) => zone,
            deps: [ZONE],
            lifetime: 'scoped',
          }),
        ],
      }),
    );
    expect(await rejected(ship.createScope())).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      cause: { code: 'NEXUS_NOT_READY', target: 'Zone' },
    });
    expect(zones).toBeLessThanOrEqual(1);
  });

  it('builds an earlier eager: false singleton in the level of a load that needs it', async () => {
    const events: string[] = [];
    const SHIELDS = new Token<IReactor>('Shields');
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [
        provide(REACTOR, {
          useClass: reactor('Reactor', events),
          eager: false,
        }),
      ],
      exports: [REACTOR],
      global: true,
    });
    const ship = await Nexus.create(
      defineModule({ name: 'Bridge', imports: [Engineering] }),
    );
    await ship.load(
      defineModule({
        name: 'Tactical',
        providers: [
          provide(SHIELDS, { useFactory: (core) => core, deps: [REACTOR] }),
        ],
        exports: [SHIELDS],
      }),
    );
    expect(events).toEqual(['Reactor built']);
    expect(ship.get(SHIELDS)).toBe(ship.get(REACTOR));
  });

  it('builds an earlier eager: false scoped factory in the level of an extend() that needs it', async () => {
    let zones = 0;
    const ZONE = new Token<number>('Zone');
    const GRID = new Token<number>('Grid');
    const Zones = defineModule({
      name: 'Zones',
      providers: [
        provide(ZONE, {
          useFactory: () => ++zones,
          lifetime: 'scoped',
          eager: false,
        }),
      ],
      exports: [ZONE],
      global: true,
    });
    const ship = await Nexus.create(
      defineModule({ name: 'Bridge', imports: [Zones] }),
    );
    const shuttle = await ship.createScope();
    await ship.load(
      defineModule({
        name: 'Tactical',
        providers: [
          provide(GRID, {
            useFactory: (zone) => zone * 10,
            deps: [ZONE],
            lifetime: 'scoped',
          }),
        ],
        exports: [GRID],
      }),
    );
    await shuttle.extend();
    expect(zones).toBe(1);
    expect(shuttle.get(GRID)).toBe(10);
    expect(shuttle.get(ZONE)).toBe(1);
  });

  it('forgets an earlier eager: false singleton a failed load built before its onInit ran, and builds it again', async () => {
    const events: string[] = [];
    const SHIELDS = new Token<IReactor>('Shields');
    class Reactor implements IReactor {
      readonly output = 1.21;
      constructor() {
        events.push('built');
      }
      onInit() {
        events.push('init');
      }
      [Symbol.dispose]() {
        events.push('disposed');
      }
    }
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [provide(REACTOR, { useClass: Reactor, eager: false })],
      exports: [REACTOR],
      global: true,
    });
    const ship = await Nexus.create(
      defineModule({ name: 'Bridge', imports: [Engineering] }),
    );
    await rejected(
      ship.load(
        defineModule({
          name: 'Tactical',
          providers: [
            provide(SHIELDS, {
              useFactory: (): IReactor => {
                throw new Error('overload');
              },
              deps: [REACTOR],
            }),
          ],
        }),
      ),
    );
    expect(events).toEqual(['built']);
    ship.get(REACTOR);
    expect(events).toEqual(['built', 'built', 'init']);
    await ship[Symbol.asyncDispose]();
    expect(events).toEqual(['built', 'built', 'init', 'disposed', 'disposed']);
  });

  it('keeps an earlier eager: false scoped factory a failed extend() built for a delta factory', async () => {
    let zones = 0;
    const ZONE = new Token<number>('Zone');
    const GRID = new Token<number>('Grid');
    const FAULT = new Token<number>('Fault');
    const Zones = defineModule({
      name: 'Zones',
      providers: [
        provide(ZONE, {
          useFactory: () => ++zones,
          lifetime: 'scoped',
          eager: false,
        }),
      ],
      exports: [ZONE],
      global: true,
    });
    const ship = await Nexus.create(
      defineModule({ name: 'Bridge', imports: [Zones] }),
    );
    const shuttle = await ship.createScope();
    await ship.load(
      defineModule({
        name: 'Tactical',
        providers: [
          provide(GRID, {
            useFactory: (zone) => zone * 10,
            deps: [ZONE],
            lifetime: 'scoped',
          }),
          provide(FAULT, {
            useFactory: (): Promise<number> =>
              Promise.reject(new Error('overload')),
            deps: [GRID],
            lifetime: 'scoped',
          }),
        ],
      }),
    );
    await rejected(shuttle.extend());
    expect(shuttle.get(ZONE)).toBe(1);
    expect(zones).toBe(1);
  });
});
