import { DEFAULT_RELAY_URL, meridian } from './meridian.module';

/**
 * The relay graph at `RELAY_URL`, which the profile target sets to the
 * address of a relay it starts. The CLI loads this export, so the profile
 * shows the charts download and the handshake. Without `RELAY_URL` it is
 * `Meridian`.
 */
export const RelayMeridian = relayMeridian();

/** Builds the relay graph for the `RELAY_URL` set when it is called. */
export function relayMeridian(): ReturnType<typeof meridian> {
  return meridian(process.env.RELAY_URL || DEFAULT_RELAY_URL);
}
