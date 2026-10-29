import * as z from 'zod/mini';

import { shown } from '../../options-schema';
import { formatNumber } from '../../text';

import { DEFAULT_COMMS_FREQUENCY } from './contracts';

/** The longest delay, in ms, a Node timer holds: 2 ** 31 - 1. */
const MAX_RELAY_TIMEOUT = 2_147_483_647;

/** The refusal text of a field: what it accepts, then the value it got. */
const refusing = (accepted: string) => (issue: { readonly input?: unknown }) =>
  `expected ${accepted}, got ${shown(issue.input)}`;

const FREQUENCY = refusing('a positive finite number');
const RELAY_URL = refusing('an http or https URL');
const RELAY_TIMEOUT = refusing(
  `a whole number of ms from 1 to ${formatNumber(MAX_RELAY_TIMEOUT, 0)}`,
);

/**
 * The options `SubspaceLink.forRoot()` takes. The container runs it at create and
 * rejects with `NEXUS_PROVIDER_FAILED`, whose cause is
 * `NEXUS_INVALID_MODULE_OPTIONS`. A key outside the shape is refused.
 * `frequency` is `DEFAULT_COMMS_FREQUENCY` when the options leave it out.
 * `AbortSignal.timeout` throws on NaN, a negative, a fraction and
 * Infinity, and 0 aborts at once. Node's timers hold at most 2 ** 31 - 1 ms,
 * and a longer `AbortSignal.timeout` aborts within a few ms or throws. So
 * `relayTimeout` must be a whole number of ms from 1 to `MAX_RELAY_TIMEOUT`
 * when it is set.
 */
export const SUBSPACE_LINK_OPTIONS_SCHEMA = z.strictObject({
  frequency: z._default(
    z.number({ error: FREQUENCY }).check(z.positive({ error: FREQUENCY })),
    DEFAULT_COMMS_FREQUENCY,
  ),
  relayUrl: z.url({ protocol: /^https?$/, error: RELAY_URL }),
  relayTimeout: z.optional(
    z
      .int({ error: RELAY_TIMEOUT })
      .check(
        z.minimum(1, { error: RELAY_TIMEOUT }),
        z.maximum(MAX_RELAY_TIMEOUT, { error: RELAY_TIMEOUT }),
      ),
  ),
});
