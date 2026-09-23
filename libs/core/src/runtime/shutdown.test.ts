import { describe, expect, it, vi } from 'vitest';

import { rejected, thrown } from '../../test-support/catch.js';
import { deferred, flush } from '../../test-support/deferred.js';
import { defineModule } from '../definitions/define-module.js';
import { lazy } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import type { TraceEvent } from './trace.js';
import { Nexus } from './nexus.js';

function disposable(log: string[], name: string) {
  return {
    async [Symbol.asyncDispose]() {
      log.push(name);
    },
  };
}

describe('Nexus', () => {
  describe('[Symbol.asyncDispose]', () => {
    it('reports the exact reverse creation order through dispose:instance events', async () => {
      const events: TraceEvent[] = [];
      const log: string[] = [];
      class Reactor {
        async [Symbol.asyncDispose]() {
          log.push('reactor');
        }
      }
      class Probe {
        async [Symbol.asyncDispose]() {
          log.push('probe');
        }
      }
      class Computer {
        constructor(
          readonly reactor: Reactor,
          readonly probe: Probe,
        ) {}
        async [Symbol.asyncDispose]() {
          log.push('computer');
        }
      }
      class Bridge {
        constructor(readonly computer: Computer) {}
        async [Symbol.asyncDispose]() {
          log.push('bridge');
        }
      }
      const SAME = new Token<Reactor>('SameReactor');
      const VALUE = new Token<object>('Value');
      const ship = await Nexus.create(
        defineModule({
          name: 'Engineering',
          providers: [
            Reactor,
            provide(Probe, { lifetime: 'transient' }),
            provide(Computer, { deps: [Reactor, Probe] }),
            provide(Bridge, { deps: [Computer] }),
            provide(SAME, { useFactory: (r) => r, deps: [Reactor] }),
            provide(VALUE, { useValue: disposable(log, 'value') }),
          ],
        }),
        { trace: (event) => events.push(event) },
      );
      ship.get(Probe); // untracked root-level transient: never disposed by the container

      await ship[Symbol.asyncDispose]();

      expect(
        events
          .filter((e) => e.type === 'dispose:instance')
          .map((e) => (e.type === 'dispose:instance' ? e.token : '')),
      ).toEqual(['Bridge', 'Computer', 'Probe', 'Reactor']);
      expect(events.at(-1)).toMatchObject({
        type: 'dispose',
        disposed: 4,
        errors: 0,
      });
      expect(log).toEqual(['bridge', 'computer', 'probe', 'reactor']);
    });

    it('returns the first call promise from a second call, so a double signal scrams once', async () => {
      const dispose = vi.fn();
      class Reactor {
        [Symbol.dispose]() {
          dispose();
        }
      }
      const ship = await Nexus.create(
        defineModule({ name: 'Root', providers: [Reactor] }),
      );
      const first = ship[Symbol.asyncDispose]();
      const second = ship[Symbol.asyncDispose]();
      expect(second).toBe(first);
      await first;
      expect(dispose).toHaveBeenCalledOnce();
    });

    it('awaits Symbol.asyncDispose once and never calls Symbol.dispose on an instance with both', async () => {
      const calls: string[] = [];
      class Reactor {
        async [Symbol.asyncDispose]() {
          calls.push('async');
        }
        [Symbol.dispose]() {
          calls.push('sync');
        }
      }
      const ship = await Nexus.create(
        defineModule({ name: 'Root', providers: [Reactor] }),
      );
      await ship[Symbol.asyncDispose]();
      expect(calls).toEqual(['async']);
    });

    it('disposes a factory result and never a useValue value', async () => {
      const log: string[] = [];
      const MADE = new Token<object>('Made');
      const GIVEN = new Token<object>('Given');
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(MADE, {
              useFactory: () => disposable(log, 'made'),
              deps: [],
            }),
            provide(GIVEN, { useValue: disposable(log, 'given') }),
          ],
        }),
      );
      await ship[Symbol.asyncDispose]();
      expect(log).toEqual(['made']);
    });

    it('keeps disposing after a disposer throws and throws the errors chained as SuppressedError', async () => {
      const log: string[] = [];
      class A {
        [Symbol.dispose]() {
          log.push('a');
          throw new Error('a stuck');
        }
      }
      class B {
        [Symbol.dispose]() {
          log.push('b');
          throw new Error('b stuck');
        }
      }
      const ship = await Nexus.create(
        defineModule({ name: 'Root', providers: [A, B] }),
      );
      const error = (await rejected(
        ship[Symbol.asyncDispose](),
      )) as SuppressedError;
      expect(log).toEqual(['b', 'a']);
      expect(error).toBeInstanceOf(SuppressedError);
      expect(error.error).toMatchObject({ message: 'a stuck' });
      expect(error.suppressed).toMatchObject({ message: 'b stuck' });
    });

    it('disposes open scopes, newest first, before the root instances', async () => {
      const log: string[] = [];
      const SCOPED = new Token<object>('Scoped');
      class Reactor {
        [Symbol.dispose]() {
          log.push('root');
        }
      }
      let n = 0;
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            Reactor,
            provide(SCOPED, {
              useFactory: () => disposable(log, `scope ${n++}`),
              deps: [],
              lifetime: 'scoped',
            }),
          ],
        }),
      );
      await ship.createScope();
      await ship.createScope();
      await ship[Symbol.asyncDispose]();
      expect(log).toEqual(['scope 1', 'scope 0', 'root']);
    });

    it('awaits a scope that is already closing before disposing root instances', async () => {
      const log: string[] = [];
      const gate = deferred();
      const SCOPED = new Token<object>('Scoped');
      class Reactor {
        [Symbol.dispose]() {
          log.push('reactor');
        }
      }
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            Reactor,
            provide(SCOPED, {
              useFactory: () => ({
                async [Symbol.asyncDispose]() {
                  await gate.promise;
                  log.push('scoped');
                },
              }),
              deps: [],
              lifetime: 'scoped',
            }),
          ],
        }),
      );
      const shuttle = await ship.createScope();
      shuttle.get(SCOPED);

      // The scope's own close starts first, and blocks on the gate. Root
      // disposal starts while that close is still in flight.
      const closingScope = shuttle[Symbol.asyncDispose]();
      const closingRoot = ship[Symbol.asyncDispose]();
      await flush();
      expect(log).toEqual([]);

      gate.resolve();
      await Promise.all([closingScope, closingRoot]);
      expect(log).toEqual(['scoped', 'reactor']);
    });

    it('keeps disposing and still emits dispose when the trace callback throws for a dispose:instance event', async () => {
      const log: string[] = [];
      class Reactor {
        [Symbol.dispose]() {
          log.push('reactor');
        }
      }
      class Computer {
        constructor(readonly reactor: Reactor) {}
        [Symbol.dispose]() {
          log.push('computer');
        }
      }
      const boom = new Error('trace exploded');
      const events: TraceEvent[] = [];
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [Reactor, provide(Computer, { deps: [Reactor] })],
        }),
        {
          trace: (event) => {
            events.push(event);
            if (event.type === 'dispose:instance' && event.token === 'Computer')
              throw boom;
          },
        },
      );
      const error = await rejected(ship[Symbol.asyncDispose]());
      expect(log).toEqual(['computer', 'reactor']);
      expect(error).toBe(boom);
      expect(events.at(-1)).toMatchObject({
        type: 'dispose',
        disposed: 2,
        errors: 1,
      });
    });

    it('keeps disposing every root instance and chains a disposer error with the trace callback throw for the dispose event', async () => {
      const log: string[] = [];
      class Reactor {
        [Symbol.dispose]() {
          log.push('reactor');
        }
      }
      class Computer {
        constructor(readonly reactor: Reactor) {}
        [Symbol.dispose]() {
          log.push('computer');
          throw new Error('computer stuck');
        }
      }
      const boom = new Error('trace exploded');
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [Reactor, provide(Computer, { deps: [Reactor] })],
        }),
        {
          trace: (event) => {
            if (event.type === 'dispose') throw boom;
          },
        },
      );
      const error = (await rejected(
        ship[Symbol.asyncDispose](),
      )) as SuppressedError;
      expect(log).toEqual(['computer', 'reactor']);
      expect(error).toBeInstanceOf(SuppressedError);
      expect(error.error).toBe(boom);
      expect(error.suppressed).toMatchObject({ message: 'computer stuck' });
    });

    it('lets a disposer reach a live dependency through a thunk and throws NEXUS_DISPOSED for a disposed one', async () => {
      const seen: string[] = [];
      class Reactor {
        output = 1.21;
        [Symbol.dispose]() {}
      }
      class Monitor {
        constructor(readonly reactor: () => Reactor) {}
        [Symbol.dispose]() {
          seen.push(String(this.reactor().output));
        }
      }
      class Logger {
        constructor(readonly monitor: () => Monitor) {}
        [Symbol.dispose]() {
          try {
            this.monitor();
          } catch (error) {
            seen.push((error as { code: string }).code);
          }
        }
      }
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(Logger, { deps: [lazy(Monitor)] }),
            Reactor,
            provide(Monitor, { deps: [lazy(Reactor)] }),
          ],
        }),
      );
      await ship[Symbol.asyncDispose]();
      expect(seen).toEqual(['1.21', 'NEXUS_DISPOSED']);
    });
  });
});

describe('Scope', () => {
  describe('[Symbol.asyncDispose]', () => {
    it('disposes its instances once, emits dispose:instance with its id, and throws NEXUS_DISPOSED afterwards', async () => {
      const events: TraceEvent[] = [];
      const log: string[] = [];
      class Logbook {
        [Symbol.dispose]() {
          log.push('logbook');
        }
      }
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [provide(Logbook, { lifetime: 'scoped' })],
        }),
        {
          trace: (event) => events.push(event),
        },
      );
      const shuttle = await ship.createScope();
      shuttle.get(Logbook);
      const first = shuttle[Symbol.asyncDispose]();
      expect(shuttle[Symbol.asyncDispose]()).toBe(first);
      await first;
      expect(log).toEqual(['logbook']);
      expect(events.filter((e) => e.type === 'dispose:instance')).toEqual([
        {
          type: 'dispose:instance',
          token: 'Logbook',
          providerId: 'p0',
          scope: 's0',
        },
      ]);
      expect(thrown(() => shuttle.get(Logbook))).toMatchObject({
        code: 'NEXUS_DISPOSED',
        target: 'scope',
      });
    });
  });
});
