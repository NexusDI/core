import { defineModule, lazy, Nexus, provide, Token } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { findCode, rejected } from '../test-support/catch.js';
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
});
