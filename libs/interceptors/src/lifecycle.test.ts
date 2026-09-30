import {
  defineModule,
  lazy,
  Nexus,
  provide,
  Token,
  type NexusPlugin,
  type ProviderView,
} from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { findCode, rejected, thrown } from '../test-support/catch.js';
import { interceptor } from './options.js';
import { interceptors } from './plugin.js';
import type { CallContext, Interceptor, Next } from './types.js';

interface IJournal {
  write(line: string): void;
  readonly lines: string[];
}
interface IStore {
  flush(): string;
}

const JOURNAL = new Token<IJournal>('Journal');
const STORE = new Token<IStore>('Store');
const LOG = new Token<Interceptor>('Log');

class Journal implements IJournal {
  readonly lines: string[] = [];
  write(line: string): void {
    this.lines.push(line);
  }
}

class LogInterceptor implements Interceptor {
  static deps = [JOURNAL] as const;
  constructor(private readonly journal: IJournal) {}
  intercept(call: CallContext, next: Next) {
    this.journal.write(`${call.provider.name}.${String(call.method)}`);
    return next();
  }
}

class Store implements IStore {
  flush(): string {
    return 'flushed';
  }
}

const JournalModule = defineModule({
  name: 'Journal',
  providers: [provide(JOURNAL, { useClass: Journal })],
  exports: [JOURNAL],
});

const StoreModule = defineModule({
  name: 'Store',
  providers: [provide(STORE, { useClass: Store })],
  exports: [STORE],
});

const logging = () =>
  interceptors({
    imports: [JournalModule],
    register: [interceptor(LOG, { useClass: LogInterceptor })],
    global: [LOG],
    exempt: [JOURNAL],
  });

describe('session lifecycle', () => {
  it('runs interceptors for a disposer that calls an intercepted dependency', async () => {
    const flushed: string[] = [];
    class Session {
      static deps = [STORE] as const;
      constructor(private readonly store: IStore) {}
      [Symbol.dispose]() {
        flushed.push(this.store.flush());
      }
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [StoreModule, JournalModule],
        providers: [Session],
        exports: [JOURNAL],
      }),
      { plugins: [logging()] },
    );
    const journal = ship.get(JOURNAL);
    await ship[Symbol.asyncDispose]();
    expect(flushed).toEqual(['flushed']);
    expect(journal.lines).toEqual(['Store.flush']);
  });

  it('runs an intercepted Symbol.asyncDispose through container disposal', async () => {
    class Pool {
      closed = false;
      async [Symbol.asyncDispose]() {
        this.closed = true;
      }
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [JournalModule],
        providers: [Pool],
        exports: [JOURNAL],
      }),
      { plugins: [logging()] },
    );
    const pool = ship.get(Pool);
    await ship[Symbol.asyncDispose]();
    expect(pool.closed).toBe(true);
  });

  it('intercepts a service a disposer builds through lazy()', async () => {
    const TRANSIENT = new Token<IStore>('Transient');
    const flushed: string[] = [];
    class Closer {
      static deps = [lazy(TRANSIENT)] as const;
      constructor(private readonly store: () => IStore) {}
      [Symbol.dispose]() {
        flushed.push(this.store().flush());
      }
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [JournalModule],
        providers: [
          provide(TRANSIENT, { useClass: Store, lifetime: 'transient' }),
          Closer,
        ],
        exports: [JOURNAL],
      }),
      { plugins: [logging()] },
    );
    const journal = ship.get(JOURNAL);
    await ship[Symbol.asyncDispose]();
    expect(flushed).toEqual(['flushed']);
    expect(journal.lines).toEqual(['Transient.flush']);
  });

  it('fails the second of two overlapping creates, and the first keeps its own session', async () => {
    const plugin = logging();
    const Extra1 = defineModule({ name: 'Extra1' });
    const Extra2 = defineModule({ name: 'Extra2' });
    const first = defineModule({
      name: 'First',
      imports: [Extra1, Extra2, StoreModule, JournalModule],
      exports: [STORE, JOURNAL],
    });
    const second = defineModule({
      name: 'Second',
      imports: [JournalModule],
    });
    const [a, b] = await Promise.allSettled([
      Nexus.create(first, { plugins: [plugin] }),
      Nexus.create(second, { plugins: [plugin] }),
    ]);
    expect(b.status).toBe('rejected');
    expect(
      findCode(
        (b as PromiseRejectedResult).reason,
        'NEXUS_INTERCEPTORS_SHARED',
      ),
    ).toBeDefined();
    expect(a.status).toBe('fulfilled');
    await using ship = (a as PromiseFulfilledResult<Nexus>).value;
    expect(ship.get(STORE).flush()).toBe('flushed');
    expect(ship.get(JOURNAL).lines).toEqual(['Store.flush']);
  });

  it('frees the plugin object when create fails before the interceptors are built', async () => {
    const plugin = logging();
    const BROKEN = new Token<object>('Broken');
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Broken',
          imports: [JournalModule],
          providers: [
            provide(BROKEN, {
              useFactory: () => {
                throw new Error('no connection');
              },
            }),
          ],
        }),
        { plugins: [plugin] },
      ),
    );
    expect(findCode(error, 'NEXUS_PROVIDER_FAILED')).toBeDefined();
    await using ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [StoreModule, JournalModule],
        exports: [STORE, JOURNAL],
      }),
      { plugins: [plugin] },
    );
    expect(ship.get(STORE).flush()).toBe('flushed');
    expect(ship.get(JOURNAL).lines).toEqual(['Store.flush']);
  });

  it('frees the plugin object when an onInit fails after the interceptors are built', async () => {
    const plugin = logging();
    class Failing {
      onInit() {
        throw new Error('warmup failed');
      }
    }
    await rejected(
      Nexus.create(
        defineModule({
          name: 'Broken',
          imports: [JournalModule],
          providers: [Failing],
        }),
        { plugins: [plugin] },
      ),
    );
    await using ship = await Nexus.create(
      defineModule({ name: 'App', imports: [JournalModule] }),
      { plugins: [plugin] },
    );
    expect(ship).toBeDefined();
  });

  it('frees the plugin object when compile fails', async () => {
    const plugin = logging();
    const MISSING = new Token<object>('Missing');
    class NeedsMissing {
      static deps = [MISSING] as const;
      constructor(_missing: object) {}
    }
    await rejected(
      Nexus.create(
        defineModule({
          name: 'Broken',
          imports: [JournalModule],
          providers: [NeedsMissing],
        }),
        { plugins: [plugin] },
      ),
    );
    await using ship = await Nexus.create(
      defineModule({ name: 'App', imports: [JournalModule] }),
      { plugins: [plugin] },
    );
    expect(ship).toBeDefined();
  });

  it('frees the plugin object when another plugin fails the compile, in either order', async () => {
    class LintError extends Error {
      readonly code = 'NEXUS_TEST_LINT';
    }
    const veto = {
      name: 'veto',
      apiVersion: 1,
      compile: {
        check: (_view: unknown, report: (error: never) => void) =>
          report(new LintError('lint') as never),
      },
    };
    for (const order of ['before', 'after'] as const) {
      const plugin = logging();
      await rejected(
        Nexus.create(
          defineModule({ name: 'Vetoed', imports: [JournalModule] }),
          { plugins: order === 'before' ? [veto, plugin] : [plugin, veto] },
        ),
      );
      await using ship = await Nexus.create(
        defineModule({
          name: 'App',
          imports: [StoreModule, JournalModule],
          exports: [STORE, JOURNAL],
        }),
        { plugins: [plugin] },
      );
      expect(ship.get(STORE).flush()).toBe('flushed');
      expect(ship.get(JOURNAL).lines).toEqual(['Store.flush']);
    }
  });

  it('frees the plugin object when a module options schema rejects before any build', async () => {
    const plugin = logging();
    const TUNING = new Token<{ gain: number }>('Tuning');
    const Radio = defineModule({
      name: 'Radio',
      options: TUNING,
      schema: {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: () => ({ issues: [{ message: 'no gain' }] }),
        },
      },
    });
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Tuned',
          imports: [Radio.forRoot({ gain: 1 }), JournalModule],
        }),
        { plugins: [plugin] },
      ),
    );
    expect(findCode(error, 'NEXUS_INVALID_MODULE_OPTIONS')).toBeDefined();
    // A different graph: the stale compile cannot match it.
    await using ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [StoreModule, JournalModule],
        exports: [STORE, JOURNAL],
      }),
      { plugins: [plugin] },
    );
    expect(ship.get(STORE).flush()).toBe('flushed');
    expect(ship.get(JOURNAL).lines).toEqual(['Store.flush']);
  });

  it('lets the second of two overlapping creates run when the first fails before any build', async () => {
    const plugin = logging();
    const TUNING = new Token<{ gain: number }>('Tuning');
    const Radio = defineModule({
      name: 'Radio',
      options: TUNING,
      schema: {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: async () => ({ issues: [{ message: 'no gain' }] }),
        },
      },
    });
    const [a, b] = await Promise.allSettled([
      Nexus.create(
        defineModule({
          name: 'Tuned',
          imports: [Radio.forRoot({ gain: 1 }), JournalModule],
        }),
        { plugins: [plugin] },
      ),
      Nexus.create(
        defineModule({
          name: 'App',
          imports: [StoreModule, JournalModule],
          exports: [STORE, JOURNAL],
        }),
        { plugins: [plugin] },
      ),
    ]);
    expect(a.status).toBe('rejected');
    expect(b.status).toBe('fulfilled');
    await using ship = (b as PromiseFulfilledResult<Nexus>).value;
    expect(ship.get(STORE).flush()).toBe('flushed');
    expect(ship.get(JOURNAL).lines).toEqual(['Store.flush']);
  });

  it('keeps a disposing container on its own session while a new one claims the plugin object', async () => {
    const plugin = logging();
    let next: Promise<Nexus> | undefined;
    const App = defineModule({
      name: 'App',
      imports: [StoreModule, JournalModule],
      exports: [STORE, JOURNAL],
    });
    const flushed: string[] = [];
    class Closer {
      static deps = [STORE] as const;
      constructor(private readonly store: IStore) {}
      async [Symbol.asyncDispose]() {
        next ??= Nexus.create(App, { plugins: [plugin] });
        await next;
        flushed.push(this.store.flush());
      }
    }
    const first = await Nexus.create(
      defineModule({
        name: 'First',
        imports: [StoreModule, JournalModule],
        providers: [Closer],
        exports: [JOURNAL],
      }),
      { plugins: [plugin] },
    );
    const journal = first.get(JOURNAL);
    await first[Symbol.asyncDispose]();
    expect(flushed).toEqual(['flushed']);
    expect(journal.lines).toEqual(['Store.flush']);
    if (next === undefined) throw new Error('the disposer did not run');
    await using second = await next;
    expect(second.get(STORE).flush()).toBe('flushed');
    expect(second.get(JOURNAL).lines).toEqual(['Store.flush']);
  });

  it('wraps scoped services and providers a load adds, with the container session', async () => {
    const SCOPED = new Token<IStore>('ScopedStore');
    const LATE = new Token<IStore>('LateStore');
    const ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [JournalModule],
        providers: [provide(SCOPED, { useClass: Store, lifetime: 'scoped' })],
        exports: [SCOPED, JOURNAL],
      }),
      { plugins: [logging()] },
    );
    await using scope = await ship.createScope();
    scope.get(SCOPED).flush();
    await ship.load(
      defineModule({
        name: 'Late',
        providers: [provide(LATE, { useClass: Store, lifetime: 'transient' })],
        exports: [LATE],
      }),
    );
    ship.get(LATE).flush();
    ship.get(LATE).flush();
    expect(ship.get(JOURNAL).lines).toEqual([
      'ScopedStore.flush',
      'LateStore.flush',
      'LateStore.flush',
    ]);
    await ship[Symbol.asyncDispose]();
  });

  it('wraps every service of a create after a failed compile of the same graph', async () => {
    const plugin = logging();
    const App = defineModule({
      name: 'App',
      imports: [StoreModule, JournalModule],
      exports: [STORE, JOURNAL],
    });
    const veto = {
      name: 'veto',
      apiVersion: 1,
      compile: {
        check: (_view: unknown, report: (error: never) => void) =>
          report(new Error('vetoed') as never),
      },
    };
    await rejected(Nexus.create(App, { plugins: [plugin, veto] }));
    await using ship = await Nexus.create(App, { plugins: [plugin] });
    expect(ship.get(STORE).flush()).toBe('flushed');
    expect(ship.get(JOURNAL).lines).toEqual(['Store.flush']);
  });

  it('wraps a lazy singleton first built after a load', async () => {
    const LATE = new Token<IStore>('LateStore');
    await using ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [JournalModule],
        providers: [provide(STORE, { useClass: Store, eager: false })],
        exports: [STORE, JOURNAL],
      }),
      { plugins: [logging()] },
    );
    await ship.load(
      defineModule({
        name: 'Late',
        providers: [provide(LATE, { useClass: Store })],
        exports: [LATE],
      }),
    );
    ship.get(STORE).flush();
    expect(ship.get(JOURNAL).lines).toEqual(['Store.flush']);
  });

  it('wraps a scoped service a scope opened before a load builds after it', async () => {
    const SCOPED = new Token<IStore>('ScopedStore');
    await using ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [JournalModule],
        providers: [provide(SCOPED, { useClass: Store, lifetime: 'scoped' })],
        exports: [SCOPED, JOURNAL],
      }),
      { plugins: [logging()] },
    );
    await using scope = await ship.createScope();
    await ship.load(defineModule({ name: 'Late' }));
    scope.get(SCOPED).flush();
    expect(ship.get(JOURNAL).lines).toEqual(['ScopedStore.flush']);
  });

  it('wraps services when the container is not an instance of this copy of core', async () => {
    // A second copy of @nexusdi/core builds a Nexus that fails instanceof
    // against this copy's class. The plugin takes the container the hooks
    // name as it is, so it still finds the session.
    const plugin = logging();
    const stand = new WeakMap<object, object>();
    const foreign = (container: object): object => {
      let other = stand.get(container);
      if (other === undefined) {
        other = { has: (token: never) => (container as Nexus).has(token) };
        stand.set(container, other);
      }
      return other;
    };
    const renamed: NexusPlugin = {
      ...plugin,
      construct: (instance, provider, scope, container) =>
        plugin.construct?.(
          instance,
          provider,
          scope,
          foreign(container) as Nexus,
        ),
      setup: (context) =>
        plugin.setup?.(
          Object.create(context, {
            container: { value: foreign(context.container) },
          }) as typeof context,
        ),
    };
    const ship = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [StoreModule, JournalModule],
        exports: [STORE, JOURNAL],
      }),
      { plugins: [renamed] },
    );
    expect(foreign(ship)).not.toBeInstanceOf(Nexus);
    const store = ship.get(STORE);
    expect(store.flush()).toBe('flushed');
    expect(ship.get(JOURNAL).lines).toEqual(['Store.flush']);
    await ship[Symbol.asyncDispose]();
    expect(
      findCode(
        thrown(() => store.flush()),
        'NEXUS_INTERCEPTOR_NOT_READY',
      ),
    ).toMatchObject({ state: 'disposed' });
  });

  it('throws UNCHECKED for a provider view no compile.check of the plugin saw', () => {
    const plugin = logging();
    const view = {
      id: 'p1',
      name: 'Stray',
      module: 'm1',
      kind: 'class',
    } as unknown as ProviderView;
    const error = thrown(() => plugin.construct?.({}, view, null, {} as Nexus));
    expect(findCode(error, 'NEXUS_INTERCEPTORS_UNCHECKED')).toMatchObject({
      target: 'Stray',
    });
  });

  it("builds a disposing container's scope without the session of the container that claimed the plugin object", async () => {
    const plugin = logging();
    const SCOPED = new Token<IStore>('ScopedStore');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = await Nexus.create(
      defineModule({
        name: 'First',
        imports: [JournalModule],
        providers: [
          provide(SCOPED, {
            useFactory: async () => {
              await gate;
              return new Store();
            },
            lifetime: 'scoped',
          }),
        ],
      }),
      { plugins: [plugin] },
    );
    const opening = rejected(first.createScope());
    const disposing = first[Symbol.asyncDispose]();
    await using second = await Nexus.create(
      defineModule({
        name: 'App',
        imports: [StoreModule, JournalModule],
        exports: [STORE, JOURNAL],
      }),
      { plugins: [plugin] },
    );
    release();
    expect(await opening).toMatchObject({ code: 'NEXUS_DISPOSED' });
    await disposing;
    expect(second.get(STORE).flush()).toBe('flushed');
    expect(second.get(JOURNAL).lines).toEqual(['Store.flush']);
  });
});
