import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { thrown } from '../../test-support/catch.js';
import { flush } from '../../test-support/deferred.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';

const rawProvide = provide as (token: unknown, options?: unknown) => never;

describe('Nexus', () => {
  describe('get', () => {
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    beforeEach(() => {
      unhandled.length = 0;
      process.on('unhandledRejection', record);
    });
    afterEach(() => {
      process.off('unhandledRejection', record);
    });

    it('throws NEXUS_ASYNC_TRANSIENT when a transient factory returns a promise, and leaves no unhandled rejection', async () => {
      const PROBE = new Token<object>('Probe');
      const Science = defineModule({
        name: 'Science',
        providers: [
          rawProvide(PROBE, {
            useFactory: () => Promise.reject(new Error('late')),
            deps: [],
            lifetime: 'transient',
          }),
        ],
      });
      const ship = await Nexus.create(Science);
      expect(thrown(() => ship.get(PROBE))).toMatchObject({
        code: 'NEXUS_ASYNC_TRANSIENT',
        token: 'Probe',
        module: 'Science',
      });
      await flush();
      expect(unhandled).toEqual([]);
    });

    // A Knex-style query builder: a class whose instances are thenable. Only
    // a factory result is awaited (spec §6.1), so a transient class is stored
    // and returned as constructed, and its then() is never called.
    it('returns a transient instance of a thenable class as is and never calls its then', async () => {
      const calls: string[] = [];
      class Query {
        then(resolve: (rows: string[]) => void): void {
          calls.push('then');
          resolve(['row']);
        }
      }
      const QUERY = new Token<Query>('Query');
      await using ship = await Nexus.create(
        defineModule({
          name: 'Data',
          providers: [
            provide(QUERY, { useClass: Query, lifetime: 'transient' }),
            provide(Query, { lifetime: 'transient' }),
          ],
        }),
      );
      const aliased = ship.get(QUERY);
      const own = ship.get(Query);
      expect(aliased).toBeInstanceOf(Query);
      expect(own).toBeInstanceOf(Query);
      expect(ship.get(Query)).not.toBe(own);
      {
        await using scope = await ship.createScope();
        expect(scope.get(QUERY)).toBeInstanceOf(Query);
      }
      await flush();
      expect(calls).toEqual([]);
    });

    it('wraps a constructor error in NEXUS_PROVIDER_FAILED with the construction path', async () => {
      class Sensor {
        constructor() {
          throw new Error('sensor burnt out');
        }
      }
      class Probe {
        constructor(readonly sensor: Sensor) {}
      }
      const Science = defineModule({
        name: 'Science',
        providers: [
          provide(Sensor, { lifetime: 'transient' }),
          provide(Probe, { deps: [Sensor], lifetime: 'transient' }),
        ],
      });
      const ship = await Nexus.create(Science);
      expect(thrown(() => ship.get(Probe))).toMatchObject({
        code: 'NEXUS_PROVIDER_FAILED',
        token: 'Sensor',
        module: 'Science',
        path: ['Probe', 'Sensor'],
        cause: { message: 'sensor burnt out' },
      });
    });
  });
});
