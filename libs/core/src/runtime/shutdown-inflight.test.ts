import { describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { deferred, flush } from '../../test-support/deferred.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';

function sensor(log: string[], name: string) {
  return {
    [Symbol.dispose]() {
      log.push(`${name} disposed`);
    },
  };
}

describe('Nexus', () => {
  describe('[Symbol.asyncDispose]', () => {
    it('waits for an in-flight load, which disposes what it built and rejects NEXUS_DISPOSED', async () => {
      const log: string[] = [];
      const gate = deferred<object>();
      const SENSOR = new Token<object>('Sensor');
      const LATER = new Token<string>('Later');
      const Science = defineModule({
        name: 'Science',
        providers: [
          provide(SENSOR, { useFactory: () => gate.promise, deps: [] }),
          provide(LATER, {
            useFactory: () => (log.push('later built'), 'x'),
            deps: [SENSOR],
          }),
        ],
      });
      const ship = await Nexus.create(defineModule({ name: 'Root' }));
      const loading = ship.load(Science);
      await flush();

      const closing = ship[Symbol.asyncDispose]();
      gate.resolve(sensor(log, 'sensor'));

      expect(await rejected(loading)).toMatchObject({
        code: 'NEXUS_DISPOSED',
        target: 'container',
      });
      await closing;
      expect(log).toEqual(['sensor disposed']);
    });

    it('waits for an in-flight createScope, which disposes what it built and rejects NEXUS_DISPOSED', async () => {
      const log: string[] = [];
      const gate = deferred<object>();
      const SESSION = new Token<object>('Session');
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(SESSION, {
              useFactory: () => gate.promise,
              deps: [],
              lifetime: 'scoped',
            }),
          ],
        }),
      );
      const opening = ship.createScope();
      await flush();

      const closing = ship[Symbol.asyncDispose]();
      gate.resolve(sensor(log, 'session'));

      expect(await rejected(opening)).toMatchObject({
        code: 'NEXUS_DISPOSED',
        target: 'container',
      });
      await closing;
      expect(log).toEqual(['session disposed']);
    });

    it('rejects a load queued behind another when disposal starts', async () => {
      const gate = deferred<string>();
      const A = new Token<string>('A');
      const B = new Token<string>('B');
      const ship = await Nexus.create(defineModule({ name: 'Root' }));
      const first = ship.load(
        defineModule({
          name: 'First',
          providers: [provide(A, { useFactory: () => gate.promise, deps: [] })],
        }),
      );
      const second = ship.load(
        defineModule({
          name: 'Second',
          providers: [provide(B, { useValue: 'b' })],
        }),
      );
      await flush();
      const closing = ship[Symbol.asyncDispose]();
      gate.resolve('a');
      expect(await rejected(first)).toMatchObject({ code: 'NEXUS_DISPOSED' });
      expect(await rejected(second)).toMatchObject({ code: 'NEXUS_DISPOSED' });
      await closing;
    });

    it('rejects a load blocked in level-0 onInit, skips level-1 onInit, and disposes what it built in reverse', async () => {
      const log: string[] = [];
      const gate = deferred<void>();
      const REACTOR = new Token<object>('Reactor');
      const COMPUTER = new Token<object>('Computer');
      const Science = defineModule({
        name: 'Science',
        providers: [
          provide(REACTOR, {
            useFactory: () => ({
              async onInit() {
                await gate.promise;
              },
              [Symbol.dispose]() {
                log.push('reactor disposed');
              },
            }),
            deps: [],
          }),
          provide(COMPUTER, {
            useFactory: () => ({
              onInit() {
                log.push('computer onInit ran');
              },
              [Symbol.dispose]() {
                log.push('computer disposed');
              },
            }),
            deps: [REACTOR],
          }),
        ],
      });
      const ship = await Nexus.create(defineModule({ name: 'Root' }));
      const loading = ship.load(Science);
      await flush();

      const closing = ship[Symbol.asyncDispose]();
      gate.resolve();

      expect(await rejected(loading)).toMatchObject({
        code: 'NEXUS_DISPOSED',
        target: 'container',
      });
      await closing;
      expect(log).toEqual(['computer disposed', 'reactor disposed']);
    });

    it('chains a rollback disposer error from an aborted load into the container disposal rejection', async () => {
      const gate = deferred<object>();
      const SENSOR = new Token<object>('Sensor');
      const boom = new Error('sensor disposer failed');
      const Science = defineModule({
        name: 'Science',
        providers: [
          provide(SENSOR, { useFactory: () => gate.promise, deps: [] }),
        ],
      });
      const ship = await Nexus.create(defineModule({ name: 'Root' }));
      const loading = ship.load(Science);
      await flush();

      const closing = ship[Symbol.asyncDispose]();
      gate.resolve({
        [Symbol.dispose]() {
          throw boom;
        },
      });

      expect(await rejected(loading)).toMatchObject({ code: 'NEXUS_DISPOSED' });
      expect(await rejected(closing)).toBe(boom);
    });
  });
});
