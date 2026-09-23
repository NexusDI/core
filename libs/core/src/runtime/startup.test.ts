import { describe, expect, it, vi } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { frequencySchema } from '../../test-support/schema.js';
import { compile } from '../blueprint/compile.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import type { StandardSchemaV1 } from '../definitions/standard-schema.js';
import { Token } from '../definitions/token.js';
import { DisposedError, ProviderError } from '../errors/index.js';
import { Nexus } from './nexus.js';
import { createRootState } from './state.js';
import { startBlueprint } from './startup.js';
import { Tracer, type TraceEvent } from './trace.js';

function disposable(
  log: string[],
  name: string,
  options: { failDispose?: boolean } = {},
) {
  return class {
    static readonly label = name;
    constructor(..._deps: unknown[]) {}
    async [Symbol.asyncDispose]() {
      log.push(`dispose ${name}`);
      if (options.failDispose) throw new Error(`${name} stuck`);
    }
  };
}

describe('Nexus', () => {
  describe('create', () => {
    it('throws NEXUS_PROVIDER_FAILED for the first failure by declaration order, with the rest in alsoFailed', async () => {
      const first = new Error('first');
      const second = new Error('second');
      const A = new Token<string>('A');
      const B = new Token<string>('B');
      const Root = defineModule({
        name: 'Root',
        providers: [
          provide(A, { useFactory: () => Promise.reject(first), deps: [] }),
          provide(B, {
            useFactory: () => {
              throw second;
            },
            deps: [],
          }),
        ],
      });
      const error = await rejected(Nexus.create(Root));
      expect(error).toBeInstanceOf(ProviderError);
      expect(error).toMatchObject({
        code: 'NEXUS_PROVIDER_FAILED',
        token: 'A',
        module: 'Root',
        path: ['A'],
        cause: first,
        alsoFailed: [{ token: 'B', module: 'Root', cause: second }],
        disposalErrors: [],
      });
    });

    it('reports the construction stack that led to a failure as path', async () => {
      class Probe {
        constructor() {
          throw new Error('probe jammed');
        }
      }
      class ShipComputer {
        constructor(readonly probe: Probe) {}
      }
      const Root = defineModule({
        name: 'Root',
        providers: [
          provide(Probe, { lifetime: 'transient' }),
          provide(ShipComputer, { deps: [Probe] }),
        ],
      });
      expect(await rejected(Nexus.create(Root))).toMatchObject({
        token: 'Probe',
        path: ['ShipComputer', 'Probe'],
        cause: { message: 'probe jammed' },
      });
    });

    it('disposes every instance built so far, one at a time, in reverse creation order', async () => {
      const log: string[] = [];
      const Reactor = disposable(log, 'reactor');
      const Computer = disposable(log, 'computer');
      class Bridge {
        constructor(readonly computer: unknown) {
          throw new Error('bridge offline');
        }
      }
      const Root = defineModule({
        name: 'Root',
        providers: [
          Reactor,
          provide(Computer, { deps: [Reactor] }),
          provide(Bridge, { deps: [Computer] }),
        ],
      });
      await rejected(Nexus.create(Root));
      expect(log).toEqual(['dispose computer', 'dispose reactor']);
    });

    it('emits dispose:instance, with scope null, for what a failed startup disposed', async () => {
      class Reactor {
        [Symbol.dispose]() {}
      }
      class Computer {
        constructor(readonly reactor: Reactor) {}
        [Symbol.dispose]() {}
      }
      class Bridge {
        constructor(readonly computer: Computer) {
          throw new Error('bridge offline');
        }
      }
      const Root = defineModule({
        name: 'Root',
        providers: [
          Reactor,
          provide(Computer, { deps: [Reactor] }),
          provide(Bridge, { deps: [Computer] }),
        ],
      });
      const events: TraceEvent[] = [];
      await rejected(
        Nexus.create(Root, { trace: (event) => events.push(event) }),
      );
      expect(
        events
          .filter((e) => e.type === 'dispose:instance')
          .map((e) =>
            e.type === 'dispose:instance'
              ? { token: e.token, scope: e.scope }
              : null,
          ),
      ).toEqual([
        { token: 'Computer', scope: null },
        { token: 'Reactor', scope: null },
      ]);
    });

    it('collects every disposer error in disposalErrors and keeps disposing', async () => {
      const log: string[] = [];
      const Reactor = disposable(log, 'reactor', { failDispose: true });
      const Shields = disposable(log, 'shields');
      class Bridge {
        constructor(readonly deps: unknown) {
          throw new Error('bridge offline');
        }
      }
      const Root = defineModule({
        name: 'Root',
        providers: [Reactor, Shields, provide(Bridge, { deps: [Reactor] })],
      });
      const error = await rejected(Nexus.create(Root));
      expect(log).toEqual(['dispose shields', 'dispose reactor']);
      expect((error as ProviderError).disposalErrors).toMatchObject([
        { message: 'reactor stuck' },
      ]);
    });

    it('wraps a DisposedError a trace callback throws on a construct event for an alias provider while the root is open', async () => {
      // registerStatic (startup.ts) calls traceConstruct directly for an
      // alias or a schema-less useValue provider, in its own synchronous
      // loop, before any singleton build starts: unlike every singleton
      // build, that call never goes through settleLevel's LevelFailure
      // wrapping. A trace callback throwing DisposedError here reaches
      // startBlueprint's catch as a bare DisposedError while root.disposing
      // is still false, which is exactly the path the root.disposing guard
      // exists for. registerStatic runs before any singleton (or scoped)
      // build, so no owned instance with a disposer exists yet when this
      // throws; disposalErrors is empty here because there is nothing to
      // roll back yet, not because a rollback error was lost.
      const REACTOR = new Token<object>('Reactor');
      const ALIAS = new Token<object>('ReactorAlias');
      const Root = defineModule({
        name: 'Root',
        providers: [
          provide(REACTOR, { useValue: {} }),
          provide(ALIAS, { useExisting: REACTOR }),
        ],
      });
      const error = (await rejected(
        Nexus.create(Root, {
          trace: (event: TraceEvent) => {
            if (event.type === 'construct' && event.token === 'ReactorAlias')
              throw new DisposedError({ target: 'container' });
          },
        }),
      )) as ProviderError;
      expect(error).toBeInstanceOf(ProviderError);
      expect(error).toMatchObject({ code: 'NEXUS_PROVIDER_FAILED' });
      expect(error.cause).toBeInstanceOf(DisposedError);
      expect(error.disposalErrors).toEqual([]);
    });

    it.each([
      ['a string', 'reactor offline', 'reactor offline'],
      ['undefined', undefined, 'undefined'],
      [
        'an object with a null prototype',
        Object.create(null) as object,
        '[object Object]',
      ],
    ])(
      'keeps a thrown %s as cause and still formats its message',
      async (_label, value, text) => {
        const NAME = new Token<string>('Name');
        const Root = defineModule({
          name: 'Root',
          providers: [
            provide(NAME, {
              useFactory: () => {
                throw value;
              },
              deps: [],
            }),
          ],
        });
        const error = (await rejected(Nexus.create(Root))) as ProviderError;
        expect(error.cause).toBe(value);
        expect(error.message).toBe(
          `[NEXUS_PROVIDER_FAILED] Name (module Root) failed: ${text}`,
        );
      },
    );

    it('validates with() options against the schema and reports NEXUS_INVALID_MODULE_OPTIONS', async () => {
      const OPTIONS = new Token<{ frequency: number; band?: string }>(
        'CommsOptions',
      );
      const Comms = defineModule({
        name: 'Comms',
        options: OPTIONS,
        schema: frequencySchema(),
      });
      const error = (await rejected(
        Nexus.create(
          defineModule({
            name: 'Root',
            imports: [Comms.with({ frequency: 'high' } as never)],
          }),
        ),
      )) as ProviderError;
      expect(error).toMatchObject({
        code: 'NEXUS_PROVIDER_FAILED',
        token: 'CommsOptions',
        module: 'Comms',
      });
      expect(error.cause).toMatchObject({
        code: 'NEXUS_INVALID_MODULE_OPTIONS',
        module: 'Comms',
        issues: [{ message: 'expected a number', path: ['frequency'] }],
      });
    });

    it('validates a with() factory result after it resolves', async () => {
      const OPTIONS = new Token<{ frequency: number; band?: string }>(
        'CommsOptions',
      );
      const Comms = defineModule({
        name: 'Comms',
        options: OPTIONS,
        schema: frequencySchema(),
      });
      const tuned = Comms.with({
        deps: [],
        useFactory: async () => ({ frequency: 'late' }) as never,
      });
      const error = (await rejected(
        Nexus.create(defineModule({ name: 'Root', imports: [tuned] })),
      )) as ProviderError;
      expect(error.cause).toMatchObject({
        code: 'NEXUS_INVALID_MODULE_OPTIONS',
      });
    });

    it('provides the schema output as the options value', async () => {
      const OPTIONS = new Token<{ frequency: number; band?: string }>(
        'CommsOptions',
      );
      const Comms = defineModule({
        name: 'Comms',
        options: OPTIONS,
        schema: frequencySchema(),
      });
      const tuned = Comms.with({ frequency: 1420 });
      const ship = await Nexus.create(
        defineModule({ name: 'Root', imports: [tuned] }),
      );
      expect(ship.get(OPTIONS, { module: tuned })).toEqual({
        frequency: 1420,
        band: 'S',
      });
    });

    it('stores a schema-validated options value with a then method as is, never calling it', async () => {
      const then = vi.fn();
      const OPTIONS = new Token<{ then: () => void }>('WithThenOptions');
      const schema: StandardSchemaV1<unknown, { then: () => void }> = {
        '~standard': {
          version: 1,
          vendor: 'nexusdi-test',
          validate: () => ({ value: { then } }),
        },
      };
      const Comms = defineModule({ name: 'Comms', options: OPTIONS, schema });
      const tuned = Comms.with({ then } as never);
      const ship = await Nexus.create(
        defineModule({ name: 'Root', imports: [tuned] }),
      );
      const value = ship.get(OPTIONS, { module: tuned });
      expect(value.then).toBe(then);
      expect(then).not.toHaveBeenCalled();
    });

    it("leaves a failed build's useValue objects claimable afterward", async () => {
      const shared = {};
      const VALUE = new Token<object>('Value');
      class Boom {
        constructor() {
          throw new Error('boom');
        }
      }
      const bp = compile({
        root: defineModule({
          name: 'Root',
          providers: [provide(VALUE, { useValue: shared }), Boom],
        }),
      });
      const root = createRootState({
        blueprint: bp,
        rootRef: {},
        tracer: new Tracer(),
        initEnabled: true,
        scopeContext: undefined,
      });
      await expect(
        startBlueprint(root, { bp, isNew: () => true }),
      ).rejects.toMatchObject({ code: 'NEXUS_PROVIDER_FAILED' });
      expect(root.ownership.claim(shared)).toBe(true);
    });

    it("keeps an earlier build's useValue object registered when a later failed build reuses it", async () => {
      const shared = {};
      const A = new Token<object>('A');
      const B = new Token<object>('B');
      class Boom {
        constructor() {
          throw new Error('boom');
        }
      }
      const firstBp = compile({
        root: defineModule({
          name: 'Root',
          providers: [provide(A, { useValue: shared })],
        }),
      });
      const root = createRootState({
        blueprint: firstBp,
        rootRef: {},
        tracer: new Tracer(),
        initEnabled: true,
        scopeContext: undefined,
      });
      await startBlueprint(root, { bp: firstBp, isNew: () => true });
      // `shared` is now registered as a useValue object by the first build,
      // which succeeded and is not being undone.
      expect(root.ownership.claim(shared)).toBe(false);

      const secondBp = compile({
        root: defineModule({
          name: 'Root',
          providers: [
            provide(A, { useValue: shared }),
            provide(B, { useValue: shared }),
            Boom,
          ],
        }),
      });
      const isNew = (id: string): boolean => !firstBp.providers.has(id);
      await expect(
        startBlueprint(root, { bp: secondBp, isNew }),
      ).rejects.toMatchObject({ code: 'NEXUS_PROVIDER_FAILED' });
      // The second build's registration of the same object is a no-op
      // (Ownership.registerValue already saw it), so its failure must not
      // undo the first build's still-live registration.
      expect(root.ownership.claim(shared)).toBe(false);
    });
  });
});
