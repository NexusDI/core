import type { ErrorTextPack } from '@nexusdi/core';
import type { RelayError } from '@nexusdi/meridian-systems';
import { shipText } from '@nexusdi/meridian-systems/text';

/** The fix for a ship without a relay: the targets that start one. */
export const RELAY_FIX =
  'Start the relay with `npx nx run @nexusdi/bridge-api:dev-relay` and set RELAY_URL to its address, or run `npx nx run @nexusdi/bridge-api:dev`, which starts both.';

/**
 * The fix of each notice an accepted command carries, by notice code.
 * meridian-systems words the notice, and this table adds the fix, since only
 * bridge-api knows which targets start a relay.
 */
export const NOTICE_FIX: Readonly<Record<string, string>> = {
  MERIDIAN_NO_SUBSPACE_LINK: RELAY_FIX,
};

/**
 * `MERIDIAN_RELAY` with bridge-api's fix. The message stays shipText's. This
 * pack goes ahead of shipText in `SHIP_TEXT`, and `explain()` reads the first
 * pack that holds the code.
 */
export const relayText = {
  MERIDIAN_RELAY: (error: RelayError) => ({
    message: shipText.MERIDIAN_RELAY(error).message,
    fix: RELAY_FIX,
  }),
} satisfies ErrorTextPack;
