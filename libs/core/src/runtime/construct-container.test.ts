import { describe, expect, it } from 'vitest';

import { rejected, thrown } from '../../test-support/catch.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';
import type { NexusPlugin } from './plugins.js';
import type { Scope } from './scope.js';

interface IReactorCore {
  readonly output: number;
}
interface ICaptainsLog {
  readonly entries: string[];
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const PROBE = new Token<object>('Probe');
const LOG = new Token<ICaptainsLog>('CaptainsLog');
const SIGNAL = new Token<object>('Signal');
const ARCHIVE = new Token<object>('Archive');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class CaptainsLog implements ICaptainsLog {
  readonly entries: string[] = [];
}

/** A plugin that records each build's provider name and container. */
function containerRecorder(): {
  readonly plugin: NexusPlugin;
  readonly seen: [string, Nexus | Scope][];
} {
  const seen: [string, Nexus | Scope][] = [];
  return {
    seen,
    plugin: {
      name: 'test:container',
      apiVersion: 1,
      construct: (_instance, provider, _scope, container) => {
        seen.push([provider.name, container]);
        return undefined;
      },
    },
  };
}

const Bridge = defineModule({
  name: 'Bridge',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(PROBE, { useClass: class {}, lifetime: 'transient' }),
    provide(LOG, { useClass: CaptainsLog, lifetime: 'scoped' }),
    provide(SIGNAL, { useFactory: () => ({}), lifetime: 'scoped' }),
  ],
  exports: [REACTOR, PROBE, LOG, SIGNAL],
});

describe('construct hook container', () => {
  it('receives the Nexus that create returns for singletons and root transients', async () => {
    const { plugin, seen } = containerRecorder();
    const ship = await Nexus.create(Bridge, { plugins: [plugin] });
    ship.get(PROBE);
    expect(seen).toEqual([
      ['ReactorCore', ship],
      ['Probe', ship],
    ]);
  });

  it('receives the root for the singletons a load builds', async () => {
    const { plugin, seen } = containerRecorder();
    const ship = await Nexus.create(defineModule({ name: 'Root' }), {
      plugins: [plugin],
    });
    await ship.load(Bridge);
    expect(seen).toEqual([['ReactorCore', ship]]);
  });

  it('receives the Scope that createScope returns for scoped and scope transient builds', async () => {
    const LAZY = new Token<object>('LazyArray');
    const { plugin, seen } = containerRecorder();
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        imports: [Bridge],
        providers: [provide(LAZY, { useClass: class {}, eager: false })],
        exports: [LAZY],
      }),
      { plugins: [plugin] },
    );
    seen.length = 0;
    await using scope = await ship.createScope();
    scope.get(LOG);
    scope.get(PROBE);
    // An eager: false singleton builds into the root, whichever container asked.
    scope.get(LAZY);
    expect(seen).toEqual([
      ['Signal', scope],
      ['CaptainsLog', scope],
      ['Probe', scope],
      ['LazyArray', ship],
    ]);
  });

  it('receives the extended Scope for the scoped factories extend builds', async () => {
    const { plugin, seen } = containerRecorder();
    const ship = await Nexus.create(defineModule({ name: 'Root' }), {
      plugins: [plugin],
    });
    await using scope = await ship.createScope();
    await ship.load(
      defineModule({
        name: 'Archives',
        providers: [
          provide(ARCHIVE, { useFactory: () => ({}), lifetime: 'scoped' }),
        ],
        exports: [ARCHIVE],
      }),
    );
    await scope.extend();
    expect(seen).toEqual([['Archive', scope]]);
  });

  it('receives the root for a transient built as the dep of a singleton a scope asked for', async () => {
    const LAZY = new Token<object>('LazyArray');
    const { plugin, seen } = containerRecorder();
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(PROBE, { useClass: class {}, lifetime: 'transient' }),
          provide(LAZY, {
            useFactory: (probe: object) => ({ probe }),
            deps: [PROBE],
            eager: false,
          }),
        ],
        exports: [LAZY],
      }),
      { plugins: [plugin] },
    );
    await using scope = await ship.createScope();
    scope.get(LAZY);
    expect(seen).toEqual([
      ['Probe', ship],
      ['LazyArray', ship],
    ]);
  });

  it('tells two scopes apart', async () => {
    const { plugin, seen } = containerRecorder();
    const ship = await Nexus.create(Bridge, { plugins: [plugin] });
    seen.length = 0;
    await using first = await ship.createScope();
    await using second = await ship.createScope();
    expect(first).not.toBe(second);
    expect(seen).toEqual([
      ['Signal', first],
      ['Signal', second],
    ]);
  });
});

describe('a container a construct hook holds during create', () => {
  it('serves get() for a singleton already built', async () => {
    const SENSOR = new Token<object>('Sensor');
    let read: unknown;
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(REACTOR, { useClass: FusionReactor }),
          provide(SENSOR, { useFactory: () => ({}), deps: [REACTOR] }),
        ],
      }),
      {
        plugins: [
          {
            name: 'reader',
            apiVersion: 1,
            construct: (_instance, provider, _scope, container) => {
              if (provider.token === SENSOR)
                read = (container as Nexus).get(REACTOR);
              return undefined;
            },
          },
        ],
      },
    );
    expect(read).toBe(ship.get(REACTOR));
  });

  it('runs a load() the hook starts after create has built every singleton', async () => {
    const order: string[] = [];
    let loading: Promise<void> | undefined;
    const Late = defineModule({
      name: 'Late',
      providers: [provide(ARCHIVE, { useFactory: () => ({}) })],
      exports: [ARCHIVE],
    });
    const ship = await Nexus.create(Bridge, {
      plugins: [
        {
          name: 'loader',
          apiVersion: 1,
          construct: (_instance, provider, _scope, container) => {
            order.push(provider.name);
            if (provider.token === REACTOR)
              loading = (container as Nexus).load(Late);
            return undefined;
          },
        },
      ],
    });
    await loading;
    expect(order).toEqual(['ReactorCore', 'Archive']);
    expect(ship.has(ARCHIVE)).toBe(true);
  });

  it('builds a scope the hook opens on every singleton', async () => {
    const REPORT = new Token<object>('Report');
    let opening: Promise<Scope> | undefined;
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(PROBE, { useClass: class {} }),
          provide(REACTOR, { useClass: FusionReactor }),
          provide(REPORT, {
            useFactory: (reactor: IReactorCore) => ({ reactor }),
            deps: [REACTOR],
            lifetime: 'scoped',
          }),
        ],
        exports: [REPORT],
      }),
      {
        plugins: [
          {
            name: 'opener',
            apiVersion: 1,
            construct: (_instance, provider, _scope, container) => {
              if (provider.token === PROBE && opening === undefined)
                opening = (container as Nexus).createScope();
              return undefined;
            },
          },
        ],
      },
    );
    if (opening === undefined) throw new Error('the hook did not run');
    await using scope = await opening;
    expect(scope.get(REPORT)).toEqual({ reactor: ship.get(REACTOR) });
  });

  it('is closed when create fails', async () => {
    let held: Nexus | undefined;
    // Caught at once: both settle before create rejects.
    let loading: Promise<unknown> | undefined;
    let opening: Promise<unknown> | undefined;
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(REACTOR, { useClass: FusionReactor }),
            provide(PROBE, {
              useFactory: () => {
                throw new Error('breach');
              },
              deps: [REACTOR],
            }),
          ],
        }),
        {
          plugins: [
            {
              name: 'holder',
              apiVersion: 1,
              construct: (_instance, _provider, _scope, container) => {
                held = container as Nexus;
                loading = rejected(held.load(defineModule({ name: 'Late' })));
                opening = rejected(held.createScope());
                return undefined;
              },
            },
          ],
        },
      ),
    );
    expect(error).toMatchObject({ code: 'NEXUS_PROVIDER_FAILED' });
    if (held === undefined || loading === undefined || opening === undefined)
      throw new Error('the hook did not run');
    expect(thrown(() => held?.get(REACTOR))).toMatchObject({
      code: 'NEXUS_DISPOSED',
    });
    expect(await loading).toMatchObject({ code: 'NEXUS_DISPOSED' });
    expect(await opening).toMatchObject({ code: 'NEXUS_DISPOSED' });
    await expect(held[Symbol.asyncDispose]()).resolves.toBeUndefined();
  });

  it('closes a scope whose createScope fails', async () => {
    const RELAY = new Token<object>('Relay');
    let held: Scope | undefined;
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(SIGNAL, { useFactory: () => ({}), lifetime: 'scoped' }),
          provide(RELAY, {
            useFactory: () => {
              throw new Error('static');
            },
            deps: [SIGNAL],
            lifetime: 'scoped',
          }),
        ],
        exports: [SIGNAL],
      }),
      {
        plugins: [
          {
            name: 'holder',
            apiVersion: 1,
            construct: (_instance, _provider, _scope, container) => {
              held = container as Scope;
              return undefined;
            },
          },
        ],
      },
    );
    expect(await rejected(ship.createScope())).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
    });
    if (held === undefined) throw new Error('the hook did not run');
    expect(thrown(() => held?.get(SIGNAL))).toMatchObject({
      code: 'NEXUS_DISPOSED',
    });
    await expect(held[Symbol.asyncDispose]()).resolves.toBeUndefined();
  });

  it('aborts create when the hook disposes the container, and reports the rollback', async () => {
    const SENSOR = new Token<object>('Sensor');
    const leak = new Error('coolant leak');
    let disposing: Promise<unknown> | undefined;
    class LeakyReactor implements IReactorCore {
      readonly output = 1.21;
      [Symbol.dispose]() {
        throw leak;
      }
    }
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(REACTOR, { useClass: LeakyReactor }),
            provide(SENSOR, { useFactory: () => ({}), deps: [REACTOR] }),
          ],
        }),
        {
          plugins: [
            {
              name: 'scram',
              apiVersion: 1,
              construct: (_instance, provider, _scope, container) => {
                // Caught at once: it settles before create rejects.
                if (provider.token === REACTOR)
                  disposing = rejected(
                    (container as Nexus)[Symbol.asyncDispose](),
                  );
                return undefined;
              },
            },
          ],
        },
      ),
    );
    expect(error).toMatchObject({ code: 'NEXUS_DISPOSED' });
    if (disposing === undefined) throw new Error('the hook did not run');
    expect(await disposing).toBe(leak);
  });
});

describe('a scope a construct hook holds during createScope', () => {
  it('aborts createScope when the hook disposes it, and disposes each build once', async () => {
    const RELAY = new Token<object>('Relay');
    const disposed: string[] = [];
    let disposing: Promise<void> | undefined;
    let relayBuilt = false;
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(SIGNAL, {
            useFactory: () => ({
              [Symbol.dispose]: () => void disposed.push('Signal'),
            }),
            lifetime: 'scoped',
          }),
          provide(RELAY, {
            useFactory: () => {
              relayBuilt = true;
              return {};
            },
            deps: [SIGNAL],
            lifetime: 'scoped',
          }),
        ],
      }),
      {
        plugins: [
          {
            name: 'scuttle',
            apiVersion: 1,
            construct: (_instance, provider, _scope, container) => {
              if (provider.token === SIGNAL)
                disposing = (container as Scope)[Symbol.asyncDispose]();
              return undefined;
            },
          },
        ],
      },
    );
    expect(await rejected(ship.createScope())).toMatchObject({
      code: 'NEXUS_DISPOSED',
    });
    await disposing;
    expect(relayBuilt).toBe(false);
    expect(disposed).toEqual(['Signal']);
    await ship[Symbol.asyncDispose]();
    expect(disposed).toEqual(['Signal']);
  });

  it('runs an extend() the hook starts after createScope has built the scope', async () => {
    const order: string[] = [];
    let extending: Promise<void> | undefined;
    const load: { loading?: Promise<void> } = {};
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(SIGNAL, {
            // Resolves once the load has published, so the scope was pinned
            // before it and extend() has work to do.
            useFactory: async () => {
              await load.loading;
              return {};
            },
            lifetime: 'scoped',
          }),
        ],
      }),
      {
        plugins: [
          {
            name: 'extender',
            apiVersion: 1,
            observe: (event) => {
              if (event.type === 'scope:create') order.push('scope:create');
            },
            construct: (_instance, provider, _scope, container) => {
              order.push(provider.name);
              if (provider.token === SIGNAL)
                extending = (container as Scope).extend();
              return undefined;
            },
          },
        ],
      },
    );
    load.loading = ship.load(
      defineModule({
        name: 'Archives',
        providers: [
          provide(ARCHIVE, { useFactory: () => ({}), lifetime: 'scoped' }),
        ],
        exports: [ARCHIVE],
      }),
    );
    await using scope = await ship.createScope();
    await extending;
    expect(order).toEqual(['Signal', 'scope:create', 'Archive']);
    expect(scope.has(ARCHIVE)).toBe(true);
  });
});
