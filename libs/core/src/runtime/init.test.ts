import { describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { deferred, flush } from '../../test-support/deferred.js';
import { compile } from '../blueprint/compile.js';
import { defineModule } from '../definitions/define-module.js';
import { lazy } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { runInit } from './init.js';
import { Nexus } from './nexus.js';
import { createRootState } from './state.js';
import { startBlueprint } from './startup.js';
import type { TraceEvent } from './trace.js';
import { Tracer } from './trace.js';

describe('Nexus', () => {
  describe('create', () => {
    it('runs onInit after every singleton is built, and a dependency finishes onInit first', async () => {
      const log: string[] = [];
      const reactorReady = deferred();
      class Reactor {
        constructor() {
          log.push('build reactor');
        }
        async onInit() {
          log.push('init reactor');
          await reactorReady.promise;
          log.push('reactor ready');
        }
      }
      class Computer {
        constructor(readonly reactor: Reactor) {
          log.push('build computer');
        }
        onInit() {
          log.push('init computer');
        }
      }
      const creating = Nexus.create(
        defineModule({
          name: 'Engineering',
          providers: [Reactor, provide(Computer, { deps: [Reactor] })],
        }),
      );
      await flush();
      expect(log).toEqual(['build reactor', 'build computer', 'init reactor']);
      reactorReady.resolve();
      await creating;
      expect(log).toEqual([
        'build reactor',
        'build computer',
        'init reactor',
        'reactor ready',
        'init computer',
      ]);
    });

    it('runs the onInit calls of one level together', async () => {
      const a = deferred();
      const b = deferred();
      const started: string[] = [];
      class A {
        onInit() {
          started.push('a');
          return a.promise;
        }
      }
      class B {
        onInit() {
          started.push('b');
          return b.promise;
        }
      }
      const creating = Nexus.create(
        defineModule({ name: 'Root', providers: [A, B] }),
      );
      await flush();
      expect(started).toEqual(['a', 'b']);
      a.resolve();
      b.resolve();
      await creating;
    });

    it('throws NEXUS_NOT_READY from an onInit that calls a thunk before the target onInit has run', async () => {
      class ShieldGrid {
        constructor(readonly router: unknown) {}
      }
      class PowerRouter {
        constructor(readonly shields: () => ShieldGrid) {}
        onInit() {
          this.shields();
        }
      }
      const Engineering = defineModule({
        name: 'Engineering',
        providers: [
          provide(PowerRouter, { deps: [lazy(ShieldGrid)] }),
          provide(ShieldGrid, { deps: [PowerRouter] }),
        ],
      });
      expect(await rejected(Nexus.create(Engineering))).toMatchObject({
        code: 'NEXUS_PROVIDER_FAILED',
        token: 'PowerRouter',
        cause: {
          code: 'NEXUS_NOT_READY',
          owner: 'PowerRouter',
          target: 'ShieldGrid',
        },
      });
    });

    it('lets onInit reach a lower level through a thunk once that level is ready', async () => {
      class Reactor {
        output = 1.21;
      }
      class Monitor {
        seen = 0;
        constructor(
          readonly reactor: Reactor,
          readonly again: () => Reactor,
        ) {}
        onInit() {
          this.seen = this.again().output;
        }
      }
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            Reactor,
            provide(Monitor, { deps: [Reactor, lazy(Reactor)] }),
          ],
        }),
      );
      expect(ship.get(Monitor).seen).toBe(1.21);
    });

    it('calls onInit once on an object two providers reach', async () => {
      let calls = 0;
      class Reactor {
        onInit() {
          calls++;
        }
      }
      const ALIAS = new Token<Reactor>('ReactorAgain');
      await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            Reactor,
            provide(ALIAS, { useFactory: (r) => r, deps: [Reactor] }),
          ],
        }),
      );
      expect(calls).toBe(1);
    });

    it('never calls onInit on a useValue object, a scoped instance or a transient', async () => {
      const calls: string[] = [];
      const VALUE = new Token<object>('Value');
      class Scoped {
        onInit() {
          calls.push('scoped');
        }
      }
      class Transient {
        onInit() {
          calls.push('transient');
        }
      }
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(VALUE, { useValue: { onInit: () => calls.push('value') } }),
            provide(Scoped, { lifetime: 'scoped' }),
            provide(Transient, { lifetime: 'transient' }),
          ],
        }),
      );
      ship.get(Transient);
      await using shuttle = await ship.createScope();
      shuttle.get(Scoped);
      expect(calls).toEqual([]);
    });

    it('disposes everything and rejects NEXUS_PROVIDER_FAILED when an onInit throws', async () => {
      const log: string[] = [];
      class Reactor {
        [Symbol.dispose]() {
          log.push('reactor disposed');
        }
      }
      class Computer {
        constructor(readonly reactor: Reactor) {}
        onInit() {
          throw new Error('self-test failed');
        }
      }
      const error = await rejected(
        Nexus.create(
          defineModule({
            name: 'Root',
            providers: [Reactor, provide(Computer, { deps: [Reactor] })],
          }),
        ),
      );
      expect(error).toMatchObject({
        code: 'NEXUS_PROVIDER_FAILED',
        token: 'Computer',
        cause: { message: 'self-test failed' },
      });
      expect(log).toEqual(['reactor disposed']);
    });

    it('emits an init event per onInit call', async () => {
      const events: TraceEvent[] = [];
      class Reactor {
        onInit() {}
      }
      await Nexus.create(defineModule({ name: 'Root', providers: [Reactor] }), {
        trace: (e) => events.push(e),
      });
      expect(events.filter((e) => e.type === 'init')).toMatchObject([
        { type: 'init', token: 'Reactor', providerId: 'p0' },
      ]);
    });
  });

  describe('load', () => {
    it('runs onInit for the singletons the load adds, and only for those', async () => {
      const calls: string[] = [];
      class Reactor {
        onInit() {
          calls.push('reactor');
        }
      }
      class Probe {
        onInit() {
          calls.push('probe');
        }
      }
      const ship = await Nexus.create(
        defineModule({ name: 'Root', providers: [Reactor] }),
      );
      await ship.load(
        defineModule({ name: 'Science', providers: [Probe], exports: [Probe] }),
      );
      expect(calls).toEqual(['reactor', 'probe']);
    });
  });
});

describe('runInit', () => {
  it('checks root.disposing after a level settles and stops before the next level runs', async () => {
    const ran: string[] = [];
    class Reactor {
      onInit() {
        ran.push('reactor');
        root.disposing = true;
      }
    }
    class Computer {
      constructor(readonly reactor: Reactor) {}
      onInit() {
        ran.push('computer');
      }
    }
    const bp = compile({
      root: defineModule({
        name: 'Root',
        providers: [Reactor, provide(Computer, { deps: [Reactor] })],
      }),
    });
    const root = createRootState({
      blueprint: bp,
      rootRef: {},
      tracer: new Tracer(),
      initEnabled: false,
      scopeContext: undefined,
      overrides: undefined,
    });
    // initEnabled false builds the singletons into root.slots without
    // running onInit, so this test can call runInit on its own afterward.
    await startBlueprint(root, { bp, isNew: () => true });
    expect(await rejected(runInit(root, bp, () => true))).toMatchObject({
      code: 'NEXUS_DISPOSED',
    });
    expect(ran).toEqual(['reactor']);
  });
});
