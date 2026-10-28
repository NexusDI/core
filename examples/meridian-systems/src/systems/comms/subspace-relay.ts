import { RelayError } from '../../errors';
import { formatNumber } from '../../text';

import {
  COMMS_OPTIONS,
  type CommsOptions,
  DEFAULT_RELAY_TIMEOUT,
  type ISubspaceLink,
} from './contracts';

/**
 * The subspace link over the fleet's HTTP relay. `NAV_CHARTS`'s factory calls
 * it once at startup, and no tick reads it.
 */
export class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;

  constructor(private readonly options: CommsOptions) {}

  async receive<T>(channel: string): Promise<T> {
    const url = new URL(
      channel,
      this.options.relayUrl.endsWith('/')
        ? this.options.relayUrl
        : `${this.options.relayUrl}/`,
    );
    url.searchParams.set('frequency', String(this.options.frequency));
    const timeout = this.options.relayTimeout ?? DEFAULT_RELAY_TIMEOUT;
    // The signal covers the whole exchange, from connect to the last body byte.
    const signal = AbortSignal.timeout(timeout);
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new Error(`The relay answered ${res.status} for ${channel}.`);
      }
      return (await res.json()) as T;
    } catch (error) {
      if (signal.aborted) {
        throw new RelayError({
          channel,
          reason: 'timeout',
          expected: `within ${formatNumber(timeout, 0)} ms`,
        });
      }
      throw error;
    }
  }
}
