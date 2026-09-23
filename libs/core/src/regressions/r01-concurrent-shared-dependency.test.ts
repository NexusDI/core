import { describe, expect, it, vi } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { deferred, flush } from '../../test-support/deferred.js';
import { defineModule } from '../definitions/define-module.js';
import { lazy } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { REQUEST } from '../definitions/request.js';
import { Token } from '../definitions/token.js';
import { Nexus } from '../runtime/nexus.js';

describe('R01', () => {
  it('builds a dependency shared by two concurrent async factories once, without a cycle error', async () => {
    // Two async singleton factories at one level share a dep.
    const REACTOR = new Token<{ id: string }>('Reactor');
    const LEFT = new Token<{ reactor: object }>('Left');
    const RIGHT = new Token<{ reactor: object }>('Right');
    const reactor = vi.fn(async () => ({ id: 'core' }));
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [
        provide(REACTOR, { useFactory: reactor, deps: [] }),
        provide(LEFT, {
          useFactory: async (r) => ({ reactor: r }),
          deps: [REACTOR],
        }),
        provide(RIGHT, {
          useFactory: async (r) => ({ reactor: r }),
          deps: [REACTOR],
        }),
      ],
      exports: [REACTOR, LEFT, RIGHT],
    });
    const ship = await Nexus.create(Engineering);
    expect(reactor).toHaveBeenCalledOnce();
    expect(ship.get(LEFT).reactor).toBe(ship.get(RIGHT).reactor);

    // 50 concurrent createScope calls whose scoped factories share a scoped dep.
    const SESSION = new Token<{ mission: string }>('Session');
    const A = new Token<{ session: object }>('A');
    const B = new Token<{ session: object }>('B');
    const session = vi.fn(async (request: { mission?: string }) => ({
      mission: request.mission ?? '',
    }));
    const Tactical = defineModule({
      name: 'Tactical',
      providers: [
        provide(SESSION, {
          useFactory: session,
          deps: [REQUEST],
          lifetime: 'scoped',
        }),
        provide(A, {
          useFactory: async (s) => ({ session: s }),
          deps: [SESSION],
          lifetime: 'scoped',
        }),
        provide(B, {
          useFactory: async (s) => ({ session: s }),
          deps: [SESSION],
          lifetime: 'scoped',
        }),
      ],
    });
    const fleet = await Nexus.create(Tactical);
    const scopes = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        fleet.createScope({ request: { mission: `m${i}` } }),
      ),
    );
    expect(session).toHaveBeenCalledTimes(50);
    scopes.forEach((scope, i) => {
      expect(scope.get(A).session).toBe(scope.get(B).session);
      expect(scope.get(A).session).toEqual({ mission: `m${i}` });
    });
    await Promise.all(scopes.map((scope) => scope[Symbol.asyncDispose]()));

    // A thunk called from an async factory's continuation: an in-flight target, then a ready one.
    const LATE = new Token<string>('Late');
    const EAGER = new Token<string>('Eager');
    const gate = deferred<string>();
    const Lab = defineModule({
      name: 'Lab',
      providers: [
        provide(LATE, {
          useFactory: () => gate.promise,
          deps: [],
          lifetime: 'scoped',
        }),
        provide(EAGER, {
          useFactory: async (late) => {
            await Promise.resolve();
            return late();
          },
          deps: [lazy(LATE)],
          lifetime: 'scoped',
        }),
      ],
    });
    const lab = await Nexus.create(Lab);
    const opening = lab.createScope();
    await flush();
    gate.resolve('late');
    expect(await rejected(opening)).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      token: 'Eager',
      cause: {
        code: 'NEXUS_NOT_READY',
        owner: 'Eager',
        target: 'Late',
        path: [],
      },
    });

    const CHARTS = new Token<string>('Charts');
    const Survey = defineModule({
      name: 'Survey',
      imports: [Engineering],
      providers: [
        provide(CHARTS, {
          useFactory: async (core) => {
            await Promise.resolve();
            return core().id;
          },
          deps: [lazy(REACTOR)],
          lifetime: 'scoped',
        }),
      ],
    });
    const surveyShip = await Nexus.create(Survey);
    await using survey = await surveyShip.createScope();
    expect(survey.get(CHARTS)).toBe('core');
  });
});
