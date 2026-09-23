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
