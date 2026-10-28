import type { StandardSchemaV1 } from '@nexusdi/core';

import { optionsSchema, shown } from '../../options-schema';

import type { CommsOptions } from './contracts';

/** The longest delay, in ms, a Node timer holds: 2 ** 31 - 1. */
const MAX_RELAY_TIMEOUT = 2_147_483_647;

/**
 * Checks the options `Comms.forRoot()` takes. The container runs it at create
 * and rejects with `NEXUS_PROVIDER_FAILED`, whose cause is
 * `NEXUS_INVALID_MODULE_OPTIONS`. `AbortSignal.timeout` throws on NaN, a
 * negative, a fraction and Infinity, and 0 aborts at once. Node's timers hold
 * at most 2 ** 31 - 1 ms, and a longer `AbortSignal.timeout` aborts within a
 * few ms or throws. So `relayTimeout` must be a whole number of ms from 1 to
 * `MAX_RELAY_TIMEOUT` when it is set. The schema leaves the other fields to
 * their types.
 */
export const COMMS_OPTIONS_SCHEMA: StandardSchemaV1<unknown, CommsOptions> =
  optionsSchema(
    '{ frequency, transport, relayUrl }',
    ({ relayTimeout }) =>
      relayTimeout !== undefined &&
      (typeof relayTimeout !== 'number' ||
        !Number.isInteger(relayTimeout) ||
        relayTimeout < 1 ||
        relayTimeout > MAX_RELAY_TIMEOUT)
        ? [
            {
              path: ['relayTimeout'],
              message: `expected a whole number of ms from 1 to 2,147,483,647, got ${shown(relayTimeout)}`,
            },
          ]
        : [],
    (fields) => fields as unknown as CommsOptions,
  );
