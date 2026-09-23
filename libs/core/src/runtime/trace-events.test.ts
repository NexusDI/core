import { afterEach, describe, expect, it, vi } from 'vitest';

import { rejected, thrown } from '../../test-support/catch.js';
import { defineModule } from '../definitions/define-module.js';
import { lazy } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import type { TraceEvent } from './trace.js';
import { Nexus } from './nexus.js';

class Drone {
  [Symbol.dispose]() {}
}
class Bay {
  constructor(readonly launch: () => Drone) {}
}

describe('Nexus', () => {
  describe('trace', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('emits compile for create and for load with the module and provider counts', async () => {
      const events: TraceEvent[] = [];
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [provide(Drone, { lifetime: 'transient' })],
        }),
        {
          trace: (e) => events.push(e),
        },
      );
      class Probe {}
      await ship.load(defineModule({ name: 'Science', providers: [Probe] }));
      expect(events.filter((e) => e.type === 'compile')).toMatchObject([
        { phase: 'create', modules: 1, providers: 1, errors: 0 },
        { phase: 'load', modules: 2, providers: 2, errors: 0 },
      ]);
    });

    it('emits compile with the error count before a compile failure throws', async () => {
      const events: TraceEvent[] = [];
      await rejected(
        Nexus.create(
          defineModule({
            name: 'Root',
            providers: [null as never, 42 as never],
          }),
          { trace: (e) => events.push(e) },
        ),
      );
      expect(events).toMatchObject([
        { type: 'compile', phase: 'create', errors: 2 },
      ]);
    });

    it('emits untracked for a disposable transient from root get and from a singleton thunk', async () => {
      const events: TraceEvent[] = [];
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(Drone, { lifetime: 'transient' }),
            provide(Bay, { deps: [lazy(Drone)] }),
          ],
        }),
        { trace: (e) => events.push(e) },
      );
      ship.get(Drone);
      ship.get(Bay).launch();
      expect(events.filter((e) => e.type === 'untracked')).toEqual([
        {
          type: 'untracked',
          token: 'Drone',
          providerId: 'p0',
          reason: 'root-transient',
        },
        {
          type: 'untracked',
          token: 'Drone',
          providerId: 'p0',
          reason: 'singleton-thunk',
        },
      ]);
    });

    it('emits untracked for a disposable transient from root resolve()', async () => {
      const events: TraceEvent[] = [];
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [provide(Drone, { lifetime: 'transient' })],
        }),
        { trace: (e) => events.push(e) },
      );
      ship.resolve({ drone: Drone });
      expect(events.filter((e) => e.type === 'untracked')).toEqual([
        {
          type: 'untracked',
          token: 'Drone',
          providerId: 'p0',
          reason: 'root-transient',
        },
      ]);
    });

    it('emits no untracked event for a transient without a disposer or one a scope owns', async () => {
      class Plain {}
      const events: TraceEvent[] = [];
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(Plain, { lifetime: 'transient' }),
            provide(Drone, { lifetime: 'transient' }),
          ],
        }),
        { trace: (e) => events.push(e) },
      );
      ship.get(Plain);
      await using shuttle = await ship.createScope();
      shuttle.get(Drone);
      expect(events.filter((e) => e.type === 'untracked')).toEqual([]);
    });

    it('propagates an exception the callback throws to the caller of the operation', async () => {
      const boom = new Error('log sink full');
      const trace = (event: TraceEvent) => {
        if (event.type === 'untracked') throw boom;
      };
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [provide(Drone, { lifetime: 'transient' })],
        }),
        { trace },
      );
      expect(thrown(() => ship.get(Drone))).toBe(boom);

      const failing = (event: TraceEvent) => {
        if (event.type === 'construct') throw boom;
      };
      expect(
        await rejected(
          Nexus.create(defineModule({ name: 'Root', providers: [Drone] }), {
            trace: failing,
          }),
        ),
      ).toMatchObject({
        code: 'NEXUS_PROVIDER_FAILED',
        cause: boom,
      });
    });

    it('surfaces a compile-event throw during create as a ProviderError', async () => {
      const boom = new Error('log sink full');
      const trace = (event: TraceEvent) => {
        if (event.type === 'compile') throw boom;
      };
      expect(
        await rejected(
          Nexus.create(defineModule({ name: 'Root', providers: [Drone] }), {
            trace,
          }),
        ),
      ).toMatchObject({
        code: 'NEXUS_PROVIDER_FAILED',
        cause: boom,
      });
    });

    it('surfaces a compile-event throw during load as a ProviderError', async () => {
      const boom = new Error('log sink full');
      class Probe {}
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [provide(Drone, { lifetime: 'transient' })],
        }),
        {
          trace: (event: TraceEvent) => {
            if (event.type === 'compile' && event.phase === 'load') throw boom;
          },
        },
      );
      expect(
        await rejected(
          ship.load(defineModule({ name: 'Science', providers: [Probe] })),
        ),
      ).toMatchObject({
        code: 'NEXUS_PROVIDER_FAILED',
        cause: boom,
      });
    });

    it('reads no clock without a trace callback', async () => {
      const clock = vi.spyOn(performance, 'now');
      const MISSION = new Token<string>('Mission');
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            Drone,
            provide(MISSION, {
              useFactory: async () => 'x',
              deps: [],
              lifetime: 'scoped',
            }),
          ],
        }),
      );
      const shuttle = await ship.createScope();
      shuttle.get(MISSION);
      await ship[Symbol.asyncDispose]();
      expect(clock).not.toHaveBeenCalled();
    });

    it('emits the lifecycle in order', async () => {
      const events: TraceEvent[] = [];
      class Reactor {
        onInit() {}
        [Symbol.dispose]() {}
      }
      class Logbook {
        [Symbol.dispose]() {}
      }
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [Reactor, provide(Logbook, { lifetime: 'scoped' })],
        }),
        { trace: (e) => events.push(e) },
      );
      const shuttle = await ship.createScope();
      shuttle.get(Logbook);
      await ship[Symbol.asyncDispose]();
      expect(events.map((e) => e.type)).toEqual([
        'compile',
        'construct',
        'init',
        'scope:create',
        'construct',
        'dispose:instance',
        'scope:dispose',
        'dispose:instance',
        'dispose',
      ]);
    });
  });
});
