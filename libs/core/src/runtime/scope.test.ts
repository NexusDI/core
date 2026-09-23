import { describe, expect, it, vi } from 'vitest';

import { rejected, thrown } from '../../test-support/catch.js';
import { defineModule } from '../definitions/define-module.js';
import { lazy } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { REQUEST } from '../definitions/request.js';
import { Token } from '../definitions/token.js';
import type { TraceEvent } from './trace.js';
import { Nexus } from './nexus.js';

const MISSION = new Token<string>('Mission');
const missionFromRequest = provide(MISSION, {
  useFactory: (request) => request.mission ?? 'none',
  deps: [REQUEST],
  lifetime: 'scoped',
});

describe('Nexus', () => {
  describe('createScope', () => {
    it('builds every scoped factory before it returns, and each scoped class on first get', async () => {
      const factory = vi.fn(async () => 'survey');
      const built = vi.fn();
      class Logbook {
        constructor() {
          built();
        }
      }
      const Tactical = defineModule({
        name: 'Tactical',
        providers: [
          provide(MISSION, {
            useFactory: factory,
            deps: [],
            lifetime: 'scoped',
          }),
          provide(Logbook, { lifetime: 'scoped' }),
        ],
      });
      const ship = await Nexus.create(Tactical);
      await using shuttle = await ship.createScope();
      expect(factory).toHaveBeenCalledOnce();
      expect(built).not.toHaveBeenCalled();
      expect(shuttle.get(Logbook)).toBe(shuttle.get(Logbook));
      expect(built).toHaveBeenCalledOnce();
    });

    it('keeps one scoped instance per scope', async () => {
      class Logbook {}
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [provide(Logbook, { lifetime: 'scoped' })],
        }),
      );
      await using first = await ship.createScope();
      await using second = await ship.createScope();
      expect(first.get(Logbook)).toBe(first.get(Logbook));
      expect(first.get(Logbook)).not.toBe(second.get(Logbook));
    });

    it('builds a new transient per get, and one per scoped instance that depends on it', async () => {
      class Drone {}
      class Bay {
        constructor(readonly drone: Drone) {}
      }
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(Drone, { lifetime: 'transient' }),
            provide(Bay, { deps: [Drone], lifetime: 'scoped' }),
          ],
        }),
      );
      await using shuttle = await ship.createScope();
      expect(shuttle.get(Drone)).not.toBe(shuttle.get(Drone));
      expect(shuttle.get(Bay).drone).toBe(shuttle.get(Bay).drone);
    });

    it('resolves REQUEST to the request passed to createScope', async () => {
      const ship = await Nexus.create(
        defineModule({
          name: 'Tactical',
          providers: [missionFromRequest],
          exports: [MISSION],
        }),
      );
      await using shuttle = await ship.createScope({
        request: { mission: 'survey-7' },
      });
      expect(shuttle.get(MISSION)).toBe('survey-7');
      expect(shuttle.get(REQUEST)).toEqual({ mission: 'survey-7' });
    });

    it('rejects NEXUS_REQUEST_MISSING naming the providers that depend on REQUEST', async () => {
      const ship = await Nexus.create(
        defineModule({ name: 'Tactical', providers: [missionFromRequest] }),
      );
      expect(await rejected(ship.createScope())).toMatchObject({
        code: 'NEXUS_REQUEST_MISSING',
        dependents: ['Mission'],
      });
    });

    it('gives scopes the ids s0, s1 and onward', async () => {
      const ship = await Nexus.create(defineModule({ name: 'Root' }));
      await using first = await ship.createScope();
      await using second = await ship.createScope();
      expect([first.id, second.id]).toEqual(['s0', 's1']);
    });

    it('disposes what a failed createScope built, in reverse, and rejects NEXUS_PROVIDER_FAILED', async () => {
      const log: string[] = [];
      const LOG = new Token<object>('Log');
      const BROKEN = new Token<string>('Broken');
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(LOG, {
              useFactory: () => ({
                [Symbol.dispose]: () => log.push('log closed'),
              }),
              deps: [],
              lifetime: 'scoped',
            }),
            provide(BROKEN, {
              useFactory: () => Promise.reject(new Error('jammed')),
              deps: [LOG],
              lifetime: 'scoped',
            }),
          ],
        }),
      );
      expect(await rejected(ship.createScope())).toMatchObject({
        code: 'NEXUS_PROVIDER_FAILED',
        token: 'Broken',
      });
      expect(log).toEqual(['log closed']);
    });

    it('emits scope:create and scope:dispose', async () => {
      const events: TraceEvent[] = [];
      const ship = await Nexus.create(
        defineModule({ name: 'Tactical', providers: [missionFromRequest] }),
        {
          trace: (event) => events.push(event),
        },
      );
      const shuttle = await ship.createScope({ request: { mission: 'x' } });
      await shuttle[Symbol.asyncDispose]();
      expect(events.filter((e) => e.type.startsWith('scope:'))).toMatchObject([
        { type: 'scope:create', scope: 's0', built: 1 },
        { type: 'scope:dispose', scope: 's0', disposed: 0, errors: 0 },
      ]);
    });
  });

  describe('get', () => {
    it('throws NEXUS_SCOPE_REQUIRED for a scoped token resolved from the root', async () => {
      class Drone {
        constructor(readonly mission: string) {}
      }
      const ship = await Nexus.create(
        defineModule({
          name: 'Tactical',
          providers: [
            missionFromRequest,
            provide(Drone, { deps: [MISSION], lifetime: 'transient' }),
          ],
        }),
      );
      expect(ship.has(MISSION)).toBe(true);
      expect(thrown(() => ship.get(MISSION))).toMatchObject({
        code: 'NEXUS_SCOPE_REQUIRED',
        token: 'Mission',
        path: ['Mission'],
      });
      expect(thrown(() => ship.get(Drone))).toMatchObject({
        code: 'NEXUS_SCOPE_REQUIRED',
        token: 'Mission',
        path: ['Drone', 'Mission'],
      });
    });
  });
});

describe('Scope', () => {
  it('throws NEXUS_LOADED_AFTER_SCOPE for a token loaded after the scope was created', async () => {
    class Probe {}
    const Science = defineModule({
      name: 'Science',
      providers: [Probe],
      exports: [Probe],
    });
    const ship = await Nexus.create(defineModule({ name: 'Root' }));
    await using early = await ship.createScope();
    await ship.load(Science);
    expect(thrown(() => early.get(Probe))).toMatchObject({
      code: 'NEXUS_LOADED_AFTER_SCOPE',
      token: 'Probe',
      module: 'Science',
    });
    await using late = await ship.createScope();
    expect(late.get(Probe)).toBe(ship.get(Probe));
  });

  it('resolves a lazy thunk to a scoped target inside its scope', async () => {
    class Logbook {}
    class Recorder {
      constructor(readonly logbook: () => Logbook) {}
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(Logbook, { lifetime: 'scoped' }),
          provide(Recorder, { deps: [lazy(Logbook)], lifetime: 'scoped' }),
        ],
      }),
    );
    await using shuttle = await ship.createScope();
    expect(shuttle.get(Recorder).logbook()).toBe(shuttle.get(Logbook));
  });

  it('owns a transient a lazy thunk builds from a scope-built provider', async () => {
    const disposed = vi.fn();
    class Probe {
      [Symbol.dispose] = disposed;
    }
    class Recorder {
      constructor(readonly probe: () => Probe) {}
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(Probe, { lifetime: 'transient' }),
          provide(Recorder, { deps: [lazy(Probe)], lifetime: 'scoped' }),
        ],
      }),
    );
    const shuttle = await ship.createScope();
    shuttle.get(Recorder).probe();
    expect(disposed).not.toHaveBeenCalled();
    await shuttle[Symbol.asyncDispose]();
    expect(disposed).toHaveBeenCalledOnce();
  });
});
