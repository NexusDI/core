import { Nexus, Token } from '@nexusdi/core';
import {
  interceptor,
  type Interceptor,
  interceptors,
} from '@nexusdi/interceptors';
import { interceptorsText } from '@nexusdi/interceptors/text';
import { createTestingContainer } from '@nexusdi/testing';
import { expect, it } from 'vitest';

import { FLIGHT_LOG } from '../../src/ship/contracts';
import { FtlDrive, OfflineMeridian } from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';
import { FakeFtlDrive } from '../doubles';
import {
  expectFixLine,
  expectTextWithoutFixLine,
  findCode,
} from '@nexusdi/meridian-systems/test/fix-line';
import { expectOwnFixLine } from './fix-line';

const rejection = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the promise to reject.');
};

const thrown = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to throw.');
};

it('NEXUS_SCOPE_REQUIRED names the scoped flight log the root container cannot hand out', async () => {
  await using ship = await Nexus.create(OfflineMeridian, {
    plugins: bridgePlugins(),
  });
  const error = findCode(
    thrown(() => ship.get(FLIGHT_LOG)),
    'NEXUS_SCOPE_REQUIRED',
  );
  expect(error).toMatchObject({ token: 'FlightLog' });
  expectFixLine(error);
});

it('NEXUS_DISPOSED answers a read from a container that is gone', async () => {
  const ship = await Nexus.create(OfflineMeridian, {
    plugins: bridgePlugins(),
  });
  await ship[Symbol.asyncDispose]();
  const error = findCode(
    thrown(() => ship.get(FLIGHT_LOG)),
    'NEXUS_DISPOSED',
  );
  expect(error).toMatchObject({ target: 'container' });
  expectTextWithoutFixLine(error);
});

it('NEXUS_INTERCEPTOR_LIFETIME names an interceptor bound with a lifetime, with its fix line', async () => {
  const AUDIT = new Token<Interceptor>('Audit');
  class Pass {
    intercept(_call: unknown, next: () => unknown) {
      return next();
    }
  }
  const error = findCode(
    await rejection(
      Nexus.create(OfflineMeridian, {
        plugins: [
          interceptors({
            register: [
              interceptor(AUDIT, { useClass: Pass, lifetime: 'scoped' }),
            ],
          }),
        ],
      }),
    ),
    'NEXUS_INTERCEPTOR_LIFETIME',
  );
  expect(error).toMatchObject({ token: 'Audit' });
  expectFixLine(error, interceptorsText);
});

it('NEXUS_OVERRIDE_UNUSED names an override of the FTL drive module that a startup never uses, with its fix line', async () => {
  const error = findCode(
    await rejection(
      createTestingContainer(OfflineMeridian)
        .overrideModule(FtlDrive, FakeFtlDrive)
        .create({ plugins: bridgePlugins() }),
    ),
    'NEXUS_OVERRIDE_UNUSED',
  );
  expect(error).toMatchObject({ token: 'FtlDrive' });
  expectOwnFixLine(error);
});
