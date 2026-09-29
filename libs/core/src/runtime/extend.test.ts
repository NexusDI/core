import { describe, expect, it } from 'vitest';

import { rejected, thrown } from '../../test-support/catch.js';
import { deferred, flush } from '../../test-support/deferred.js';
import { coreLine } from '../../test-support/modes.js';
import { recordEvents } from '../../test-support/observe.js';
import type { Blueprint } from '../blueprint/blueprint.js';
import { compile } from '../blueprint/compile.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { REQUEST } from '../definitions/request.js';
import { Token } from '../definitions/token.js';
import { DisposedError, type NexusError } from '../errors/index.js';
import { Nexus } from './nexus.js';
import type { NexusPlugin } from './plugins.js';

const LOG = new Token<string[]>('FlightLog');
const Root = defineModule({ name: 'Root' });

function section(name: string, factory: () => unknown) {
  const token = new Token<unknown>(name);
  return {
    token,
    module: defineModule({
      name,
      providers: [provide(token, { useFactory: factory, lifetime: 'scoped' })],
      exports: [token],
    }),
  };
}

describe('Scope.extend', () => {
  it('re-pins the scope and builds the new scoped factories', async () => {
    const ship = await Nexus.create(Root);
    const shuttle = await ship.createScope();
    const science = section('Science', () => 'probe');
    await ship.load(science.module);
    expect(thrown(() => shuttle.get(science.token))).toMatchObject({
      code: 'NEXUS_LOADED_AFTER_SCOPE',
    });
    await shuttle.extend();
    expect(shuttle.get(science.token)).toBe('probe');
  });

  it('keeps instances built before it', async () => {
    const early = section('Early', () => ({}));
    const ship = await Nexus.create(early.module);
    const shuttle = await ship.createScope();
    const before = shuttle.get(early.token);
    await ship.load(section('Late', () => 1).module);
    await shuttle.extend();
    expect(shuttle.get(early.token)).toBe(before);
  });

  it('returns at once when nothing was loaded, and after a failed load', async () => {
    const ship = await Nexus.create(Root);
    const shuttle = await ship.createScope();
    await shuttle.extend();
    await rejected(
      ship.load(defineModule({ name: 'Broken', providers: [null as never] })),
    );
    await shuttle.extend();
    expect(shuttle.has(LOG)).toBe(false);
  });

  it('throws NEXUS_REQUEST_MISSING for a new REQUEST dependent and keeps the pin', async () => {
    const ship = await Nexus.create(Root);
    const shuttle = await ship.createScope();
    const MISSION = new Token<unknown>('Mission');
    const Tactical = defineModule({
      name: 'Tactical',
      providers: [
        provide(MISSION, {
          useFactory: (request) => request,
          deps: [REQUEST],
          lifetime: 'scoped',
        }),
      ],
      exports: [MISSION],
    });
    await ship.load(Tactical);
    expect(await rejected(shuttle.extend())).toMatchObject({
      code: 'NEXUS_REQUEST_MISSING',
      dependents: ['Mission'],
    });
    expect(thrown(() => shuttle.get(MISSION))).toMatchObject({
      code: 'NEXUS_LOADED_AFTER_SCOPE',
    });
  });

  it('shares one in-flight call for the same blueprint and runs calls one at a time', async () => {
    const gate = deferred();
    let builds = 0;
    const ship = await Nexus.create(Root);
    const shuttle = await ship.createScope();
    await ship.load(
      section('Slow', async () => {
        builds++;
        await gate.promise;
        return 1;
      }).module,
    );
    const first = shuttle.extend();
    const second = shuttle.extend();
    gate.resolve();
    await Promise.all([first, second]);
    expect(builds).toBe(1);
  });

  it('rolls back and throws a ProviderError when a factory fails', async () => {
    const ship = await Nexus.create(Root);
    const shuttle = await ship.createScope();
    const broken = section('Broken', () => {
      throw new Error('offline');
    });
    await ship.load(broken.module);
    const error = await rejected(shuttle.extend());
    expect(error).toMatchObject({ code: 'NEXUS_PROVIDER_FAILED' });
    expect(thrown(() => shuttle.get(broken.token))).toMatchObject({
      code: 'NEXUS_LOADED_AFTER_SCOPE',
    });
  });

  it('disposes what it built before the older instances', async () => {
    const order: string[] = [];
    const disposable = (name: string) => () => ({
      [Symbol.dispose]: () => void order.push(name),
    });
    const early = section('Early', disposable('early'));
    const ship = await Nexus.create(early.module);
    const shuttle = await ship.createScope();
    shuttle.get(early.token);
    await ship.load(section('Late', disposable('late')).module);
    await shuttle.extend();
    await shuttle[Symbol.asyncDispose]();
    expect(order).toEqual(['late', 'early']);
  });

  it('throws NEXUS_DISPOSED on a disposed scope', async () => {
    const ship = await Nexus.create(Root);
    const shuttle = await ship.createScope();
    await shuttle[Symbol.asyncDispose]();
    expect(await rejected(shuttle.extend())).toMatchObject({
      code: 'NEXUS_DISPOSED',
      target: 'scope',
    });
  });

  it('emits scope:extend', async () => {
    const { events, plugin } = recordEvents();
    const ship = await Nexus.create(Root, { plugins: [plugin] });
    const shuttle = await ship.createScope();
    await ship.load(section('Science', () => 1).module);
    await shuttle.extend();
    expect(events.find((e) => e.type === 'scope:extend')).toMatchObject({
      scope: shuttle.id,
      modules: ['Science'],
      built: 1,
    });
  });
});

/** A scoped factory whose instance logs its disposal. */
function disposing(name: string, log: string[]) {
  return () => ({
    name,
    [Symbol.dispose]: () => void log.push(`${name} disposed`),
  });
}

describe('Scope.extend with a request', () => {
  it('builds a new REQUEST dependent from the scope request', async () => {
    const MISSION = new Token<unknown>('Mission');
    const ship = await Nexus.create(Root);
    const shuttle = await ship.createScope({ request: { crew: 4 } as never });
    await ship.load(
      defineModule({
        name: 'Tactical',
        providers: [
          provide(MISSION, {
            useFactory: (request) => request,
            deps: [REQUEST],
            lifetime: 'scoped',
          }),
        ],
        exports: [MISSION],
      }),
    );
    await shuttle.extend();
    expect(shuttle.get(MISSION)).toEqual({ crew: 4 });
  });
});

describe('Scope.extend concurrency', () => {
  it('uses the old pin for get() during an extend, and ignores a load that publishes during it', async () => {
    const gate = deferred();
    const ship = await Nexus.create(Root);
    const shuttle = await ship.createScope();
    const slow = section('Slow', async () => {
      await gate.promise;
      return 'slow';
    });
    const later = section('Later', () => 'later');
    await ship.load(slow.module);
    const extending = shuttle.extend();
    expect(thrown(() => shuttle.get(slow.token))).toMatchObject({
      code: 'NEXUS_LOADED_AFTER_SCOPE',
    });
    await ship.load(later.module);
    gate.resolve();
    await extending;
    expect(shuttle.get(slow.token)).toBe('slow');
    expect(thrown(() => shuttle.get(later.token))).toMatchObject({
      code: 'NEXUS_LOADED_AFTER_SCOPE',
    });
    await shuttle.extend();
    expect(shuttle.get(later.token)).toBe('later');
  });

  it('gives two calls for one blueprint the same rejection from one build', async () => {
    const gate = deferred();
    let builds = 0;
    const ship = await Nexus.create(Root);
    const shuttle = await ship.createScope();
    await ship.load(
      section('Slow', async () => {
        builds++;
        await gate.promise;
        throw new Error('offline');
      }).module,
    );
    const first = rejected(shuttle.extend());
    await flush();
    const second = rejected(shuttle.extend());
    gate.resolve();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toMatchObject({ code: 'NEXUS_PROVIDER_FAILED' });
    expect(b).toBe(a);
    expect(builds).toBe(1);
  });

  it('runs a call for a newer blueprint after the one in flight', async () => {
    const gate = deferred();
    const order: string[] = [];
    const ship = await Nexus.create(Root);
    const shuttle = await ship.createScope();
    await ship.load(
      section('Slow', async () => {
        order.push('slow start');
        await gate.promise;
        order.push('slow end');
        return 1;
      }).module,
    );
    const first = shuttle.extend();
    await ship.load(section('Later', () => void order.push('later')).module);
    const second = shuttle.extend();
    await flush();
    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['slow start', 'slow end', 'later']);
  });

  it('aborts with NEXUS_DISPOSED when the scope is disposed during it, after disposing what it built', async () => {
    const gate = deferred();
    const log: string[] = [];
    const early = section('Early', disposing('Early', log));
    const ship = await Nexus.create(early.module);
    const shuttle = await ship.createScope();
    await ship.load(
      defineModule({
        name: 'Science',
        providers: [
          provide(new Token('Probe'), {
            useFactory: disposing('Probe', log),
            lifetime: 'scoped',
          }),
          provide(new Token('Sensor'), {
            useFactory: async () => {
              await gate.promise;
              return disposing('Sensor', log)();
            },
            lifetime: 'scoped',
          }),
        ],
      }),
    );
    const extending = shuttle.extend();
    await flush();
    const disposal = shuttle[Symbol.asyncDispose]();
    gate.resolve();
    expect(await rejected(extending)).toMatchObject({
      code: 'NEXUS_DISPOSED',
      target: 'scope',
    });
    await disposal;
    expect(log).toEqual([
      'Sensor disposed',
      'Probe disposed',
      'Early disposed',
    ]);
  });

  it('reports the rollback disposer errors of an aborted extend in the scope disposal', async () => {
    const gate = deferred();
    const ship = await Nexus.create(Root);
    const shuttle = await ship.createScope();
    await ship.load(
      section('Probe', async () => {
        await gate.promise;
        return {
          [Symbol.dispose]: () => {
            throw new Error('probe jammed');
          },
        };
      }).module,
    );
    const extending = shuttle.extend();
    await flush();
    const disposal = shuttle[Symbol.asyncDispose]();
    gate.resolve();
    await rejected(extending);
    expect(await rejected(disposal)).toMatchObject({
      message: 'probe jammed',
    });
  });

  it('builds nothing when the scope is disposed before the call starts', async () => {
    let builds = 0;
    const ship = await Nexus.create(Root);
    const shuttle = await ship.createScope();
    await ship.load(section('Probe', () => void builds++).module);
    const extending = shuttle.extend();
    const disposal = shuttle[Symbol.asyncDispose]();
    expect(await rejected(extending)).toMatchObject({
      code: 'NEXUS_DISPOSED',
      target: 'scope',
    });
    await disposal;
    expect(builds).toBe(0);
  });

  it('makes root disposal wait for an in-flight extend', async () => {
    const gate = deferred();
    const log: string[] = [];
    const ship = await Nexus.create(Root);
    const shuttle = await ship.createScope();
    await ship.load(
      section('Probe', async () => {
        await gate.promise;
        return disposing('Probe', log)();
      }).module,
    );
    const extending = shuttle.extend();
    await flush();
    const disposal = ship[Symbol.asyncDispose]();
    await flush();
    expect(log).toEqual([]);
    gate.resolve();
    expect(await rejected(extending)).toMatchObject({
      code: 'NEXUS_DISPOSED',
    });
    await disposal;
    expect(log).toEqual(['Probe disposed']);
  });
});

describe('Scope.extend rollback', () => {
  it('keeps an older scoped class a new factory built, and a transient get() built during it', async () => {
    const gate = deferred();
    const log: string[] = [];
    class Logbook {
      disposed = false;
      [Symbol.dispose](): void {
        this.disposed = true;
      }
    }
    const PROBE = new Token<unknown>('Probe');
    const BEACON = new Token<{ disposed: boolean }>('Beacon');
    const Quarters = defineModule({
      name: 'Quarters',
      providers: [
        provide(Logbook, { lifetime: 'scoped' }),
        provide(BEACON, {
          useFactory: () => {
            const beacon = {
              disposed: false,
              [Symbol.dispose]: () => void (beacon.disposed = true),
            };
            return beacon;
          },
          lifetime: 'transient',
        }),
      ],
      exports: [Logbook, BEACON],
    });
    const ship = await Nexus.create(
      defineModule({ name: 'Root', imports: [Quarters] }),
    );
    const shuttle = await ship.createScope();
    await ship.load(
      defineModule({
        name: 'Science',
        imports: [Quarters],
        providers: [
          provide(PROBE, {
            useFactory: (logbook: Logbook) => {
              log.push(`probe got ${String(logbook instanceof Logbook)}`);
              return disposing('Probe', log)();
            },
            deps: [Logbook],
            lifetime: 'scoped',
          }),
          // Sensor shares Probe's level, so Probe builds before it fails.
          provide(new Token('Sensor'), {
            useFactory: async (_logbook: Logbook) => {
              await gate.promise;
              throw new Error('offline');
            },
            deps: [Logbook],
            lifetime: 'scoped',
          }),
        ],
      }),
    );
    const extending = shuttle.extend();
    await flush();
    const beacon = shuttle.get(BEACON);
    gate.resolve();
    expect(await rejected(extending)).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
    });
    expect(log).toEqual(['probe got true', 'Probe disposed']);
    expect(shuttle.get(Logbook).disposed).toBe(false);
    expect(beacon.disposed).toBe(false);
    await shuttle[Symbol.asyncDispose]();
    expect(beacon.disposed).toBe(true);
  });

  it('disposes a transient a failed build took as a dep', async () => {
    const log: string[] = [];
    const DRONE = new Token<unknown>('Drone');
    const ship = await Nexus.create(Root);
    const shuttle = await ship.createScope();
    await ship.load(
      defineModule({
        name: 'Science',
        providers: [
          provide(DRONE, {
            useFactory: disposing('Drone', log),
            lifetime: 'transient',
          }),
          provide(new Token('Probe'), {
            useFactory: () => {
              throw new Error('offline');
            },
            deps: [DRONE],
            lifetime: 'scoped',
          }),
        ],
      }),
    );
    await rejected(shuttle.extend());
    expect(log).toEqual(['Drone disposed']);
    await shuttle[Symbol.asyncDispose]();
    expect(log).toEqual(['Drone disposed']);
  });

  it('disposes the raw instance of a failed construct hook once', async () => {
    const log: string[] = [];
    const probe = section('Probe', disposing('Probe', log));
    const saboteur: NexusPlugin = {
      name: 'saboteur',
      apiVersion: 1,
      construct: (_, provider) => {
        if (provider.token === probe.token) throw new Error('sabotaged');
        return undefined;
      },
    };
    const ship = await Nexus.create(Root, { plugins: [saboteur] });
    const shuttle = await ship.createScope();
    await ship.load(probe.module);
    expect(await rejected(shuttle.extend())).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      cause: { code: 'NEXUS_PLUGIN_FAILED', plugin: 'saboteur' },
    });
    expect(log).toEqual(['Probe disposed']);
    await shuttle[Symbol.asyncDispose]();
    expect(log).toEqual(['Probe disposed']);
  });
});

describe('Scope.extend errors', () => {
  const text = (name: string, calls: string[]): NexusPlugin => ({
    name,
    apiVersion: 1,
    formatError: (error) => {
      calls.push(error.code);
      return { message: `${name}: ${error.code}` };
    },
  });

  it('formats NEXUS_DISPOSED on a disposed scope through formatError', async () => {
    const calls: string[] = [];
    const ship = await Nexus.create(Root, { plugins: [text('text', calls)] });
    const shuttle = await ship.createScope();
    await shuttle[Symbol.asyncDispose]();
    const extending = shuttle.extend();
    expect(extending).toBeInstanceOf(Promise);
    expect(await rejected(extending)).toMatchObject({
      message: '[NEXUS_DISPOSED] text: NEXUS_DISPOSED',
    });
    expect(calls).toEqual(['NEXUS_DISPOSED']);
  });

  it('leaves a NexusError a factory throws during extend with its own text', async () => {
    const calls: string[] = [];
    const ship = await Nexus.create(Root, { plugins: [text('text', calls)] });
    const shuttle = await ship.createScope();
    await ship.load(
      section('Probe', () => {
        throw new DisposedError({ target: 'container' });
      }).module,
    );
    const error = (await rejected(shuttle.extend())) as NexusError;
    expect(error).toMatchObject({ code: 'NEXUS_PROVIDER_FAILED' });
    const cause = error.cause as NexusError;
    expect(cause).toBeInstanceOf(DisposedError);
    expect(cause.message).toBe(coreLine(cause));
    expect(calls).toEqual(['NEXUS_PROVIDER_FAILED']);
  });
});

describe('load() visibility', () => {
  /** Each provider a module sees, named by its module and token; ids are positional. */
  function entries(bp: Blueprint, moduleId: string) {
    const named = (id: string) => {
      const record = bp.providers.get(id);
      const module = bp.modules.get(record?.module ?? '')?.name ?? '?';
      return `${module}/${record?.name ?? id}`;
    };
    return new Map(
      [...(bp.visibility.get(moduleId) ?? new Map<unknown, string[]>())].map(
        ([token, ids]) => [token, ids.map(named)] as const,
      ),
    );
  }

  it('keeps every old module seeing a superset, with equal entries for its old tokens', () => {
    const NAV_CHARTS = new Token<string>('NavCharts');
    const CORE = new Token<string>('ReactorCore');
    const PROBE = new Token<string>('Probe');
    const Nav = defineModule({
      name: 'Nav',
      providers: [provide(NAV_CHARTS, { useValue: 'charts' })],
      exports: [NAV_CHARTS],
    });
    const Engineering = defineModule({
      name: 'Engineering',
      imports: [Nav],
      providers: [provide(CORE, { useValue: 'core' })],
      exports: [CORE, Nav],
    });
    const Comms = defineModule({
      name: 'Comms',
      global: true,
      providers: [provide(LOG, { useValue: [] })],
      exports: [LOG],
    });
    const Bridge = defineModule({ name: 'Bridge', imports: [Engineering] });
    const Ship = defineModule({
      name: 'Ship',
      imports: [Comms, Engineering, Bridge],
    });
    const Science = defineModule({
      name: 'Science',
      imports: [Engineering],
      providers: [provide(PROBE, { useValue: 'probe' })],
      exports: [PROBE],
    });
    const before = compile({ root: Ship });
    const after = compile({
      root: Ship,
      extraImports: [Science],
      phase: 'load',
      previous: before,
    });
    expect(before.modules.size).toBeGreaterThan(3);
    for (const node of before.modules.values()) {
      const id = after.moduleByDefinition.get(node.definition);
      expect(id, node.name).toBeDefined();
      const old = entries(before, node.id);
      const now = entries(after, id ?? '');
      for (const [token, ids] of old)
        expect(now.get(token), node.name).toEqual(ids);
      expect(now.size).toBeGreaterThanOrEqual(old.size);
    }
    const root = after.moduleByDefinition.get(Ship) ?? '';
    expect(after.visibility.get(root)?.has(PROBE)).toBe(true);
  });
});
